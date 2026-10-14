# 2026-10-14 — Server updates and a restart (#156)

- **Asked for:** the server upkeep from the production-readiness list. 61 updates were waiting, and the server needed a restart for a new kernel.
- **What changed:**
  - **On the server:** 50 packages updated, including Docker. It was restarted onto kernel 6.8.0-147, and all eight containers came back by themselves within two minutes. Automatic security updates were already on.
  - **In the repo:** `docs/server-upkeep.md`, a monthly runbook with the exact commands that worked, and what to do if the terminal drops part way.
- **Worked first time:** nearly. The web terminal dropped mid-install. The checks in the runbook showed the install had finished cleanly anyway (`dpkg --audit` empty, the log ending normally). The containers had already restarted by themselves when Docker updated, which was the first proof they'd survive the restart too.
- **Laptop needed:** no. All of it was done from the Hostinger web terminal.
- **Friction:** only the dropped terminal. The runbook now says not to rerun the install straight away, and how to tell whether it's still going.
