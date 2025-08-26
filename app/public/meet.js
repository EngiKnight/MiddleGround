// app/public/meet.js
(function(){
  const qs = new URLSearchParams(location.search);
  const meetingId = Number(qs.get('mid'));
  const token = qs.get('token');
  const email = qs.get('email') || '';

  const titleEl = document.getElementById('title');
  const partsEl = document.getElementById('participants');
  const suggEl = document.getElementById('suggestions');
  const btnGeo = document.getElementById('btn-geo');
  const btnSubmit = document.getElementById('btn-submit');
  const latEl = document.getElementById('lat');
  const lngEl = document.getElementById('lng');

  if (!meetingId) {
    document.body.innerHTML = "<main class='container'><p class='card'>Missing meeting id.</p></main>";
    return;
  }

  async function fetchStatus() {
    const r = await fetch(`/api/meetings/${meetingId}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'failed');
    titleEl.textContent = data.meeting.title;

    // Participants
    partsEl.innerHTML = '';
    data.participants.forEach(p => {
      const li = document.createElement('li');
      li.textContent = `${p.email} — ${p.role}${p.responded ? ' ✅' : ' ⏳'}`;
      partsEl.appendChild(li);
    });

    // Suggestions
    if (data.meeting.status === 'finalized' && data.meeting.finalized_place_json) {
      const place = data.meeting.finalized_place_json;
      suggEl.innerHTML = renderFinalized(place);
      return;
    }

    const sg = await fetch(`/api/meetings/${meetingId}/suggestions`);
    const sgData = await sg.json();
    if (sgData.ready) {
      suggEl.innerHTML = renderSuggestions(sgData.venues, sgData.midpoint);
    } else {
      suggEl.textContent = sgData.reason || 'Waiting for participants...';
    }
  }

  function renderSuggestions(venues, midpoint) {
    if (!venues || venues.length === 0) {
      return `<p>No results yet near the midpoint (${midpoint.lat.toFixed(5)}, ${midpoint.lng.toFixed(5)}).</p>`;
    }
    const items = venues.map(v => `
      <li class="venue">
        <div>
          <strong>${escapeHtml(v.name)}</strong><br/>
          <small>${escapeHtml(v.location.formatted_address || '')}</small>
          ${v.distance ? `<div><small>${v.distance}m away</small></div>` : ''}
        </div>
        ${token && email ? `<button class="btn btn-ghost" data-finalize='${escapeAttr(JSON.stringify(v))}'>Finalize here</button>` : ''}
      </li>
    `).join('');

    return `
      <p>Midpoint: ${midpoint.lat.toFixed(5)}, ${midpoint.lng.toFixed(5)}</p>
      <ul class="venues">${items}</ul>
      <p><small>Only the meeting creator can finalize a venue using their secure invite link.</small></p>
    `;
  }

  function renderFinalized(place) {
    const link = googleMapsPlaceLink(place);
    return `
      <p><strong>Finalized spot:</strong> ${escapeHtml(place.name || '')}</p>
      <p>${escapeHtml(place.location?.formatted_address || '')}</p>
      ${link ? `<p><a target="_blank" href="${link}">Open in Google Maps</a></p>` : ''}
    `;
  }

  // location actions
  btnGeo?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latEl.value = pos.coords.latitude.toFixed(6);
        lngEl.value = pos.coords.longitude.toFixed(6);
        submitLocation();
      },
      (err) => alert('Unable to get location: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  btnSubmit?.addEventListener('click', submitLocation);

  async function submitLocation() {
    const lat = parseFloat(latEl.value);
    const lng = parseFloat(lngEl.value);
    if (!email || !token) {
      alert('This link is missing your secure token. Use the link from your email.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert('Enter valid latitude and longitude.');
      return;
    }
    const resp = await fetch(`/api/meetings/${meetingId}/location`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ email, token, lat, lng })
    });
    const data = await resp.json();
    if (!resp.ok) { alert(data.error || 'Failed to submit location'); return; }
    await fetchStatus();
    alert('Location saved!');
  }

  // Finalize click
  suggEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-finalize]');
    if (!btn) return;
    if (!confirm('Finalize this spot for everyone?')) return;
    const place = JSON.parse(btn.getAttribute('data-finalize'));
    const resp = await fetch(`/api/meetings/${meetingId}/finalize`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ token, email, place })
    });
    const data = await resp.json();
    if (!resp.ok) { alert(data.error || 'Failed to finalize'); return; }
    await fetchStatus();
    alert('Finalized and notified participants!');
  });

  function googleMapsPlaceLink(place) {
    try {
      const name = encodeURIComponent(place.name || '');
      const addr = encodeURIComponent(place.location?.formatted_address || '');
      return `https://www.google.com/maps/search/?api=1&query=${name}%20${addr}`;
    } catch { return null; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // initial
  fetchStatus();
  setInterval(fetchStatus, 8000);
})();
