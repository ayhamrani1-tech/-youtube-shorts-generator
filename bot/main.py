"""FootballVideoStudio Discord bot (discord.py 2.x, slash commands).

Start:  .venv\\Scripts\\python.exe -m bot.main          (needs DISCORD_TOKEN in .env)

Flow for an automatic quiz:
  /guess_player name:"Luka Modric" quiz:transfers
     → research (Wikidata + Wikipedia, in a thread) → plan card with every fact's status
     → [Approve & render] → JobQueue → node studio/make.mjs → progress message → video (or preview) in the channel

Safety:
  * only users listed in ALLOWED_USER_IDS can start/cancel jobs (others get a private "not allowed")
  * error details go to logs/bot.log; the channel only sees a short message without paths or stack traces
  * nothing is published anywhere except the channel where you ran the command
"""
from __future__ import annotations

import asyncio
import json
import logging
import logging.handlers
import re
from pathlib import Path

import discord
from discord import app_commands
from discord.ext import commands

from . import pipeline
from .config import Settings, load_settings
from .delivery import plan_delivery
from .jobs import DONE, FAILED, RUNNING, Job, JobQueue

log = logging.getLogger("fvs.bot")
STATUS_ICON = {"queued": "⏳", "running": "⚙️", "done": "✅", "failed": "❌", "cancelled": "🛑", "interrupted": "⚠️"}
CHECK_ICON = {"verified": "✅", "single-source": "⚠️", "disputed": "❌"}


def safe(text: str) -> str:
    """Remove local paths before anything is shown in Discord."""
    return re.sub(r"[A-Za-z]:\\[^\s'\"]+|/(?:Users|home)/[^\s'\"]+", "[path]", str(text))[:900]


def setup_logging(logs_dir: Path) -> None:
    logs_dir.mkdir(exist_ok=True)
    handler = logging.handlers.RotatingFileHandler(logs_dir / "bot.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    root.addHandler(logging.StreamHandler())


class StudioBot(commands.Bot):
    def __init__(self, settings: Settings):
        super().__init__(command_prefix="!", intents=discord.Intents.default())   # slash commands need no message intent
        self.settings = settings
        self.progress_messages: dict[str, discord.Message] = {}
        self.queue = JobQueue(settings.jobs_dir, on_update=self.on_job_update,
                              result_reader=lambda job: pipeline.read_report(job.result.get("slug") or job.title.split()[-1]))

    async def setup_hook(self) -> None:
        self.queue.start()
        register_commands(self)
        if self.settings.guild_id:
            guild = discord.Object(id=self.settings.guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()
        log.info("commands synced")

    async def on_ready(self) -> None:
        log.info("logged in as %s", self.user)

    # ---------- jobs ----------
    def start_render(self, slug: str, interaction: discord.Interaction, kind: str = "render", skip_render: bool = False) -> Job:
        cmd = pipeline.make_command(self.settings.node, slug, self.settings.voice, skip_render)
        job = self.queue.submit(kind, f"{kind} {slug}", cmd, self.settings.root, interaction.user.id, interaction.channel_id or 0)
        job.result = {"slug": slug}
        self.queue.save(job)
        return job

    async def on_job_update(self, job: Job) -> None:
        channel = self.get_channel(job.channel_id)
        if channel is None:
            return
        text = f"{STATUS_ICON.get(job.status, '')} **{job.title}** (`{job.id}`): {job.status}"
        if job.status == RUNNING:
            text += f": {job.stage or 'starting'} {job.percent}%"
        if job.status == FAILED and job.error:
            text += f"\n{safe(job.error)}"
        msg = self.progress_messages.get(job.id)
        try:
            if msg:
                await msg.edit(content=text)
            else:
                self.progress_messages[job.id] = await channel.send(text)
        except discord.HTTPException:
            log.exception("could not update progress for %s", job.id)
        if job.status == DONE:
            await self.deliver(job, channel)

    async def deliver(self, job: Job, channel) -> None:
        report = job.result or {}
        if job.kind == "preview":
            await self.send_preview_frames(report.get("slug", ""), channel)
            return
        out = report.get("output")
        if not out or not Path(out).exists():
            await channel.send("The job finished but no video file was found. See the bot log.")
            return
        d = await asyncio.to_thread(plan_delivery, Path(out), self.settings.max_upload_mb)
        lines = [d.note, f"Duration {report.get('duration', '?')} s · {report.get('resolution', '?')}"]
        lines += [f"⚠️ {safe(w)}" for w in report.get("warnings", [])]
        try:
            await channel.send("\n".join(lines), file=discord.File(d.file) if d.file else None)
        except discord.HTTPException:
            log.exception("upload failed for %s", job.id)
            await channel.send("Upload to Discord failed; the video is saved on the studio PC.")

    async def send_preview_frames(self, slug: str, channel) -> None:
        scenes_file = self.settings.root / "episodes" / slug / "build" / "scenes.json"
        scenes = json.loads(scenes_file.read_text(encoding="utf-8"))["scenes"] if scenes_file.exists() else []
        frames = [Path(s["frame"]) for s in scenes if s.get("frame") and Path(s["frame"]).exists()][:10]   # scene order
        if not frames:
            await channel.send("No frames were rendered.")
            return
        await channel.send(f"Preview frames for `{slug}` (first {len(frames)} scenes):", files=[discord.File(f) for f in frames])


# ---------- interaction helpers ----------
def allowed(bot: StudioBot, interaction: discord.Interaction) -> bool:
    return interaction.user.id in bot.settings.allowed_user_ids


async def deny(interaction: discord.Interaction) -> None:
    await interaction.response.send_message("You are not allowed to start jobs on this studio.", ephemeral=True)


def plan_text(draft) -> str:
    ep = draft.episode
    lines = [f"**Plan: {ep['subject']['name_ar']}** ({ep['type']}, `{draft.slug}`)"]
    data = ep["data"]
    if "stops" in data:
        lines += [f"{i + 1}. {s['row']} · {s['years']}" for i, s in enumerate(data["stops"])]
    if "attributes" in data:
        lines += [f"• {a['label']}: {a['value']}" for a in data["attributes"]] + [data.get("asOf", "")]
    if "chapters" in data:
        lines += [f"• {it['year']} {it['text']}" for sc in data["chapters"][0]["scenes"] for it in sc.get("items", [])]
    lines.append("")
    lines += [f"{CHECK_ICON[c.status]} {c.item} {c.detail}" for c in draft.checks]
    lines += [f"❓ {q}" for q in draft.questions]
    lines.append("Sources: " + " · ".join(s.split(": ", 1)[-1].split(" (")[0] for s in draft.sources))
    return "\n".join(lines)[:1900]


class ApproveView(discord.ui.View):
    def __init__(self, bot: StudioBot, draft):
        super().__init__(timeout=3600)
        self.bot, self.slug = bot, draft.slug
        if draft.blocking:
            self.approve.disabled = True
            self.approve.label = "Fix disputed facts in episode.json first"

    @discord.ui.button(label="Approve & render", style=discord.ButtonStyle.success)
    async def approve(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not allowed(self.bot, interaction):
            return await deny(interaction)
        pipeline.approve(self.slug)
        job = self.bot.start_render(self.slug, interaction)
        await interaction.response.edit_message(view=None)
        await interaction.followup.send(f"Queued `{job.id}` (position {self.bot.queue.position(job.id) or 'now'}).")

    @discord.ui.button(label="Frames only (fast preview)", style=discord.ButtonStyle.secondary)
    async def frames(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not allowed(self.bot, interaction):
            return await deny(interaction)
        job = self.bot.start_render(self.slug, interaction, kind="preview", skip_render=True)
        await interaction.response.send_message(f"Building preview frames `{job.id}`.")


class PickPlayer(discord.ui.View):
    """Shown when a name matches several footballers: the user chooses, nothing is guessed."""

    def __init__(self, bot: StudioBot, name: str, quiz: str, candidates):
        super().__init__(timeout=600)
        self.bot, self.name, self.quiz = bot, name, quiz
        options = [discord.SelectOption(label=c.label[:100] or c.qid, description=(c.description or c.qid)[:100], value=c.qid) for c in candidates[:25]]
        select = discord.ui.Select(placeholder="Which player do you mean?", options=options)
        select.callback = self.chosen
        self.add_item(select)

    async def chosen(self, interaction: discord.Interaction):
        if not allowed(self.bot, interaction):
            return await deny(interaction)
        qid = interaction.data["values"][0]
        await interaction.response.defer(thinking=True)
        await show_research(self.bot, interaction, self.name, self.quiz, qid)


async def show_research(bot: StudioBot, interaction: discord.Interaction, name: str, quiz: str, qid: str | None = None):
    res = await asyncio.to_thread(pipeline.research_quiz, name, quiz, qid)
    if res.error:
        log.warning("research failed for %r: %s", name, res.error)
        return await interaction.followup.send(f"Research stopped: {safe(res.error)}")
    if res.candidates:
        return await interaction.followup.send(f"Several footballers match “{name}”. Please choose:", view=PickPlayer(bot, name, quiz, res.candidates))
    await interaction.followup.send(plan_text(res.draft), view=ApproveView(bot, res.draft))


def register_commands(bot: StudioBot) -> None:
    tree = bot.tree

    @tree.command(name="help", description="How to use the studio bot")
    async def help_cmd(interaction: discord.Interaction):
        await interaction.response.send_message(
            "**FootballVideoStudio**\n"
            "`/guess_player` research a player → transfer or attribute quiz → approve → video\n"
            "`/player_story` research pack + short documentary skeleton (you write the chapters)\n"
            "`/goal_quiz` render a prepared “who scored” episode\n"
            "`/create_video` render any prepared episode · `/preview` frames only\n"
            "`/templates` · `/episodes` · `/job_status` · `/cancel_job` · `/retry_job`\n"
            "Facts come from Wikidata + Wikipedia and are shown with their status before anything is rendered. "
            "The automatic voice is a preview until you approve it.", ephemeral=True)

    @tree.command(name="templates", description="List the video templates")
    async def templates_cmd(interaction: discord.Interaction):
        reg = json.loads((bot.settings.root / "templates" / "registry.json").read_text(encoding="utf-8"))
        lines = [f"• `{k}`: {v.get('title_ar', '')} ({v.get('orientation', '')}) · {v.get('status', '')[:40]}" for k, v in reg["types"].items()]
        await interaction.response.send_message("\n".join(lines), ephemeral=True)

    @tree.command(name="episodes", description="List prepared episodes")
    async def episodes_cmd(interaction: discord.Interaction):
        eps = pipeline.list_episodes()
        await interaction.response.send_message("\n".join(f"`{e['slug']}` · {e['type']} · {e['title']}" for e in eps)[:1900] or "none", ephemeral=True)

    @tree.command(name="guess_player", description="Research a player and build a quiz")
    @app_commands.describe(name="Player name (English or Arabic)", quiz="Quiz type")
    @app_commands.choices(quiz=[app_commands.Choice(name="Transfers (clubs)", value="transfers"),
                                app_commands.Choice(name="Nationality, club, number, position", value="attributes")])
    async def guess_player(interaction: discord.Interaction, name: str, quiz: app_commands.Choice[str]):
        if not allowed(bot, interaction):
            return await deny(interaction)
        await interaction.response.defer(thinking=True)
        await show_research(bot, interaction, name, quiz.value)

    @tree.command(name="player_story", description="Research pack + documentary skeleton for a player")
    @app_commands.describe(name="Player name (English or Arabic)")
    async def player_story(interaction: discord.Interaction, name: str):
        if not allowed(bot, interaction):
            return await deny(interaction)
        await interaction.response.defer(thinking=True)
        await show_research(bot, interaction, name, "story")

    async def render_existing(interaction: discord.Interaction, slug: str, kind: str = "render", skip: bool = False, require_type: str | None = None):
        if not allowed(bot, interaction):
            return await deny(interaction)
        if not pipeline.episode_exists(slug):
            return await interaction.response.send_message("No episode with that name. Use `/episodes`.", ephemeral=True)
        ep_type = next((e["type"] for e in pipeline.list_episodes() if e["slug"] == slug), None)
        if require_type and ep_type != require_type:
            return await interaction.response.send_message(f"`{slug}` is a {ep_type} episode, not {require_type}.", ephemeral=True)
        job = bot.start_render(slug, interaction, kind=kind, skip_render=skip)
        await interaction.response.send_message(f"Queued `{job.id}` for `{slug}` (position {bot.queue.position(job.id) or 'now'}).")

    async def slug_autocomplete(interaction: discord.Interaction, current: str):
        return [app_commands.Choice(name=e["slug"], value=e["slug"]) for e in pipeline.list_episodes() if current.lower() in e["slug"]][:25]

    @tree.command(name="create_video", description="Render a prepared episode")
    @app_commands.autocomplete(slug=slug_autocomplete)
    async def create_video(interaction: discord.Interaction, slug: str):
        await render_existing(interaction, slug)

    @tree.command(name="goal_quiz", description="Render a prepared 'who scored the goal' episode")
    @app_commands.autocomplete(slug=slug_autocomplete)
    async def goal_quiz(interaction: discord.Interaction, slug: str):
        await render_existing(interaction, slug, require_type="who-scored")

    @tree.command(name="preview", description="Build frames only (fast) and post them")
    @app_commands.autocomplete(slug=slug_autocomplete)
    async def preview(interaction: discord.Interaction, slug: str):
        await render_existing(interaction, slug, kind="preview", skip=True)

    @tree.command(name="job_status", description="Show recent jobs or one job")
    async def job_status(interaction: discord.Interaction, job_id: str | None = None):
        jobs = [bot.queue.jobs[job_id]] if job_id in bot.queue.jobs else sorted(bot.queue.jobs.values(), key=lambda j: -j.created)[:10]
        if not jobs:
            return await interaction.response.send_message("No jobs yet.", ephemeral=True)
        lines = [f"{STATUS_ICON.get(j.status, '')} `{j.id}` {j.title}: {j.status} {j.stage} {j.percent}%"
                 + (f" (#{bot.queue.position(j.id)} in line)" if j.status == "queued" else "") for j in jobs]
        await interaction.response.send_message("\n".join(lines), ephemeral=True)

    @tree.command(name="cancel_job", description="Cancel a queued or running job")
    async def cancel_job(interaction: discord.Interaction, job_id: str):
        if not allowed(bot, interaction):
            return await deny(interaction)
        ok = await bot.queue.cancel(job_id)
        await interaction.response.send_message(f"Cancelled `{job_id}`." if ok else "Nothing to cancel with that id.", ephemeral=True)

    @tree.command(name="retry_job", description="Run a failed, cancelled or interrupted job again")
    async def retry_job(interaction: discord.Interaction, job_id: str):
        if not allowed(bot, interaction):
            return await deny(interaction)
        job = bot.queue.retry(job_id)
        await interaction.response.send_message(f"Re-queued `{job_id}`." if job else "That job cannot be retried.", ephemeral=True)

    @tree.error
    async def on_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
        log.exception("command error", exc_info=error)
        msg = "Something went wrong (details are in the bot log)."
        if interaction.response.is_done():
            await interaction.followup.send(msg, ephemeral=True)
        else:
            await interaction.response.send_message(msg, ephemeral=True)


def main() -> None:
    settings = load_settings()
    setup_logging(settings.logs_dir)
    if not settings.can_run:
        raise SystemExit("DISCORD_TOKEN is missing. Copy .env.example to .env and add your (new) bot token.")
    if not settings.allowed_user_ids:
        log.warning("ALLOWED_USER_IDS is empty: nobody can start jobs")
    StudioBot(settings).run(settings.token, log_handler=None)


if __name__ == "__main__":
    main()
