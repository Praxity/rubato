---
name: install-praxity
description: Install, update or repair Rubato, the pack that provides the `praxity` command, Praxity's tools and their agent skills. Use when `praxity` is missing or reports an unknown command, doctor fails, skills need installing for a host, or a course needs T3 actions.
---

# Install and maintain Rubato

Rubato installs per user under `~/.praxity/`. Its launcher is `~/.praxity/bin/praxity`; call it by that path when `praxity` is not on PATH. The launcher sends `praxity check`, `trace`, `print` and `import` to those tools and every other command to Studio. Tools run locally; the host and model provider control what leaves the machine.

## Install or recover

Rubato supports macOS on Apple Silicon and Intel. Work from the reviewed Rubato checkout and its `pack.json`. If the person has neither, stop and ask for them; never invent a download URL.

1. Read the checkout's README and `pack.json`. Show the person the pack version, each published download's purpose, version, URL and licence, and the reason for each unpublished tool. Explain the per-user version folder and launcher. Get consent for those downloads, then run `sh /absolute/path/to/rubato/install.sh`.
2. On failure, run the recovery command the installer reports. Never change installation steps, escalate privileges or disable OS protections. A manifest override is a trust decision; use only the person's reviewed manifest.
3. Run `~/.praxity/bin/praxity setup`. Each tool asks consent for its own optional components. Let those prompts reach the person and never pass `--yes` for them. Respect a refusal and report what stays unavailable.
4. Run `~/.praxity/bin/praxity doctor --json`. Report failed, not-installed and partial items apart from declined components, with doctor's fixes.
5. Ask which host and scope the person uses if you don't know, then run `~/.praxity/bin/praxity skills install --host <t3|claude|codex> --scope <user|project>`. `t3` and `claude` share the Claude adapter in `.claude/skills`. Add `codex` for Codex CLI or T3's Codex provider, in `.agents/skills`; both adapters can coexist. The installer leaves files it doesn't own alone. Restart the host and check that a skill can be invoked, not only listed.
6. If the launcher's folder is not on PATH, show the person the PATH line the installer printed. Never edit shell profiles or AGENTS files yourself.

Recovery commands, after resolving the reported cause:

- Retry: `sh /absolute/path/to/rubato/install.sh`. Verified downloads are reused.
- Update to the latest release: `~/.praxity/bin/praxity update`.
- Revert an update: `~/.praxity/bin/praxity rollback`.
- Remove Rubato: `sh /absolute/path/to/rubato/install.sh uninstall`.

Ask the person to save their text and close Studio before an update, rollback or removal.

## Unknown command or flag

The installed pack is older than the skill you are following. Run `~/.praxity/bin/praxity version` and show the person the pack and tool versions. Ask them to update, with `praxity update` or the install command they use for internal builds. Don't work around the missing command.

## Add T3 course actions

Before every export, run `~/.praxity/bin/praxity identity init <course-folder>` and follow the prax-format skill's identity rule. The generated actions don't run it yet, so run it before Open in Studio too.

Run `~/.praxity/bin/praxity init <course-folder>` on a folder that holds `course.yaml` or `.prax` lessons. It merges five actions into the course's `t3.json` (Open in Studio, Export HTML, Export PDF, Check accessibility, Doctor) and keeps other keys and scripts; Check accessibility reads the `course-html.zip` that Export HTML writes. Init reserves a Studio port for the course and hides `.praxity/` in VS Code settings. Commit `t3.json` with the course. If init refuses, nothing changed; fix the reported error and rerun. If T3 keeps running an old saved action, follow the repair note init prints.
