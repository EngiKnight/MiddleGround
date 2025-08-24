(() => {
  const $ = (id) => document.getElementById(id);

  const meetingTitleInput = $("meetingTitle");
  const createBtn = $("createMeeting");
  const meetStatus = $("meetStatus");
  const meetingInfo = $("meetingInfo");

  const inviteEmail = $("inviteEmail");
  const sendInvite = $("sendInvite");
  const inviteStatus = $("inviteStatus");
  const invitedList = $("invitedList");

  const myInvites = $("myInvites");
  const inviteHelp = $("inviteHelp");

  let meetingId = null;

  function setMeetingInfo(m) {
    meetingInfo.style.display = "block";
    meetingInfo.textContent = `Created meeting #${m.id} — "${m.title}"`;
    inviteHelp.textContent = `Meeting #${m.id} is ready. Invite someone:`;
    sendInvite.disabled = false;
  }

  function addInvitedPill(email) {
    const div = document.createElement("div");
    div.className = "pill";
    div.textContent = email;
    invitedList.prepend(div);
  }

  async function tryJson(res) {
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  async function authedUser() {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin" });
      const d = await tryJson(r);
      return d && d.user ? d.user : null;
    } catch {
      return null;
    }
  }

  if (!createBtn || !sendInvite || !meetingTitleInput) {
    console.error("[meet] Missing required elements on the page.");
    return;
  }

  createBtn.addEventListener("click", async () => {
    meetStatus.textContent = "Creating...";
    try {
      const title = meetingTitleInput.value.trim();
      const body = { title };
      if (!body.title) {
        meetStatus.textContent = "Please enter a title.";
        return;
      }

      const r = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const d = await tryJson(r);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);

      meetingId = d.meeting.id;
      setMeetingInfo(d.meeting);
      meetStatus.textContent = "Meeting created ✔";
    } catch (e) {
      console.error("[meet] create error:", e);
      meetStatus.textContent = e.message.includes("Not authenticated")
        ? "Please log in first."
        : `Error: ${e.message}`;
    }
  });

  sendInvite.addEventListener("click", async () => {
    if (!meetingId) {
      inviteStatus.textContent = "Create a meeting first.";
      return;
    }
    const email = inviteEmail.value.trim();
    if (!email) {
      inviteStatus.textContent = "Enter an email.";
      return;
    }

    inviteStatus.textContent = "Sending...";
    try {
      const r = await fetch(`/api/meetings/${meetingId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      const d = await tryJson(r);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);

      inviteStatus.textContent = "Invitation sent ✔";
      addInvitedPill(email);
      inviteEmail.value = "";
    } catch (e) {
      console.error("[meet] invite error:", e);
      inviteStatus.textContent = e.message.includes("forbidden")
        ? "Only the meeting owner can invite."
        : `Error: ${e.message}`;
    }
  });

  async function loadMyInvites() {
    myInvites.innerHTML = "";
    try {
      const r = await fetch("/api/my/invitations", {
        credentials: "same-origin",
      });
      const d = await tryJson(r);
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);

      const list = d.invitations || [];
      if (!list.length) {
        myInvites.innerHTML = `<div class="muted">No invitations yet.</div>`;
        return;
      }
      list.forEach((inv) => {
        const el = document.createElement("div");
        el.className = "pill";
        const when = new Date(inv.sent_at).toLocaleString();
        el.innerHTML = `
          <span><b>${inv.email}</b></span>
          <span class="small">• meeting #${inv.meeting_id}</span>
          <span class="small">• ${inv.status}</span>
          <span class="small">• sent ${when}</span>
        `;
        myInvites.appendChild(el);
      });
    } catch (e) {
      console.error("[meet] my invites error:", e);
      myInvites.innerHTML = `<div class="muted">Error loading invites: ${e.message}</div>`;
    }
  }

  (async function init() {
    const u = await authedUser();
    if (!u) {
      meetStatus.textContent = "Please log in to create a meeting.";
      inviteHelp.textContent = "Log in to send invitations.";
      createBtn.disabled = true;
      sendInvite.disabled = true;
    }
    await loadMyInvites();
  })();
})();
