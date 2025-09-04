// app/public/meet.js
(function () {
  const qs = new URLSearchParams(location.search);
  const meetingId = Number(qs.get("mid"));
  const token = qs.get("token");
  const email = qs.get("email") || "";

  const titleEl = document.getElementById("title");
  const partsEl = document.getElementById("participants");
  const suggEl = document.getElementById("suggestions");
  const btnGeo = document.getElementById("btn-geo");
  const btnSubmit = document.getElementById("btn-submit");
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");

  // Map and search elements
  const searchButton = document.getElementById("submitAddress");
  const loc = document.getElementById("location");
  const search = document.getElementById("search");
  const searchMessage = document.getElementById("searchMsg");
  const searchResults = document.getElementById("searchResultsContainer");
  const mapContainer = document.getElementById("mapContainer");
  const markerLat = document.getElementById("markerLat");
  const markerLon = document.getElementById("markerLon");

  // URLs for access to Nominatim API
  const revURL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
  const searchURL = "https://nominatim.openstreetmap.org/search?format=jsonv2";

  // Global Variables for map functionality
  let map = null;
  let currentMarker = null;
  let currentLat = null;
  let currentLon = null;

  if (!meetingId) {
    document.body.innerHTML =
      "<main class='container'><p class='card'>Missing meeting id.</p></main>";
    return;
  }

  async function fetchStatus() {
    const r = await fetch(`/api/meetings/${meetingId}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "failed");
    titleEl.textContent = data.meeting.title;

    // Participants
    partsEl.innerHTML = "";
    data.participants.forEach((p) => {
      const li = document.createElement("li");
      li.textContent = `${p.email} — ${p.role}${p.responded ? " ✅" : " ⏳"}`;
      partsEl.appendChild(li);
    });

    // Suggestions
    if (
      data.meeting.status === "finalized" &&
      data.meeting.finalized_place_json
    ) {
      const place = data.meeting.finalized_place_json;
      suggEl.innerHTML = renderFinalized(place);
      return;
    }

    const sg = await fetch(`/api/meetings/${meetingId}/suggestions`);
    const sgData = await sg.json();
    if (sgData.ready) {
      suggEl.innerHTML = renderSuggestions(sgData.venues, sgData.midpoint);
    } else {
      suggEl.textContent = sgData.reason || "Waiting for participants...";
    }
  }

  function renderSuggestions(venues, midpoint) {
    if (!venues || venues.length === 0) {
      return `<p>No results yet near the midpoint (${midpoint.lat.toFixed(5)}, ${midpoint.lng.toFixed(5)}).</p>`;
    }
    const items = venues
      .map(
        (v) => `
      <li class="venue">
        <div>
          <strong>${escapeHtml(v.name)}</strong><br/>
          <small>${escapeHtml(v.location.formatted_address || "")}</small>
          ${v.distance ? `<div><small>${v.distance}m away</small></div>` : ""}
        </div>
        ${token && email ? `<button class="btn btn-ghost" data-finalize='${escapeAttr(JSON.stringify(v))}'>Finalize here</button>` : ""}
      </li>
    `
      )
      .join("");

    return `
      <p>Midpoint: ${midpoint.lat.toFixed(5)}, ${midpoint.lng.toFixed(5)}</p>
      <ul class="venues">${items}</ul>
      <p><small>Only the meeting creator can finalize a venue using their secure invite link.</small></p>
    `;
  }

  function renderFinalized(place) {
    const link = googleMapsPlaceLink(place);
    return `
      <p><strong>Finalized spot:</strong> ${escapeHtml(place.name || "")}</p>
      <p>${escapeHtml(place.location?.formatted_address || "")}</p>
      ${link ? `<p><a target="_blank" href="${link}">Open in Google Maps</a></p>` : ""}
    `;
  }

  // location actions
  btnGeo?.addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;
        latEl.value = pos.coords.latitude.toFixed(6);
        lngEl.value = pos.coords.longitude.toFixed(6);
        initializeWithLocation();
        // submitLocation(); // Uncomment if you want to auto-submit
      },
      (err) => alert("Unable to get location: " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Search functionality
  if (searchButton) {
    searchButton.addEventListener("click", () => {
      let searchText = search.value;
      if (searchMessage) {
        searchMessage.textContent = "Getting results...";
      }

      while (searchResults && searchResults.firstChild) {
        searchResults.removeChild(searchResults.firstChild);
      }

      freeSearch(searchText)
        .then((result) => {
          if (result && result.length > 0) {
            for (let i = 0; i < result.length; i++) {
              let resultButton = document.createElement("button");
              resultButton.textContent = formatAddress(result[i]);

              resultButton.addEventListener("click", async () => {
                currentLat = parseFloat(result[i].lat);
                currentLon = parseFloat(result[i].lon);

                await initializeWithLocation();

                while (searchResults && searchResults.firstChild) {
                  searchResults.removeChild(searchResults.firstChild);
                }

                // Clear search input
                if (search) {
                  search.value = "";
                }
              });
              if (searchMessage) {
                searchMessage.textContent = "";
              }
              if (searchResults) {
                searchResults.append(resultButton);
              }
            }
          } else if (result && result.error) {
            console.log(result.error);
            let message = "Error Message: ";
            if (result.error.code || result.error.message) {
              message += result.error.message;
            } else {
              message = result.error;
            }
            if (searchMessage) {
              searchMessage.textContent = message;
            }
          } else if (!result || result.length <= 0) {
            if (searchMessage) {
              searchMessage.textContent =
                "No results returned, please try again with a different search";
            }
          }
        })
        .catch((error) => {
          console.log(error);
          if (searchMessage) {
            searchMessage.textContent = "ERROR: Check console for info";
          }
        });
    });
  }

  // Allow Enter key for address search
  if (search) {
    search.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && searchButton) {
        searchButton.click();
      }
    });
  }

  btnSubmit?.addEventListener("click", submitLocation);

  async function submitLocation() {
    const lat = parseFloat(latEl.value);
    const lng = parseFloat(lngEl.value);
    if (!email || !token) {
      alert(
        "This link is missing your secure token. Use the link from your email."
      );
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Enter valid latitude and longitude.");
      return;
    }
    const resp = await fetch(`/api/meetings/${meetingId}/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, lat, lng }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || "Failed to submit location");
      return;
    }
    await fetchStatus();
    alert("Location saved!");
  }

  // Finalize click
  suggEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-finalize]");
    if (!btn) return;
    if (!confirm("Finalize this spot for everyone?")) return;
    const place = JSON.parse(btn.getAttribute("data-finalize"));
    const resp = await fetch(`/api/meetings/${meetingId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, place }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      alert(data.error || "Failed to finalize");
      return;
    }
    await fetchStatus();
    alert("Finalized and notified participants!");
  });

  function googleMapsPlaceLink(place) {
    try {
      const name = encodeURIComponent(place.name || "");
      const addr = encodeURIComponent(place.location?.formatted_address || "");
      return `https://www.google.com/maps/search/?api=1&query=${name}%20${addr}`;
    } catch {
      return null;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]
    );
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Map and location functions from places.js
  function getLocation() {
    return new Promise((resolve, reject) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function (position) {
            currentLat = position.coords.latitude;
            currentLon = position.coords.longitude;
            browserGeoSuccess(position);
            resolve({ lat: currentLat, lon: currentLon });
          },
          function (error) {
            browserGeoError();
            console.error("Geolocation error:", error);
            reject(error);
          }
        );
      } else {
        const errorMsg = "Geolocation is not supported by this browser.";
        if (loc) loc.textContent = "Error: " + errorMsg;
        reject(new Error(errorMsg));
      }
    });
  }

  function browserGeoSuccess(position) {
    let lat = position.coords.latitude;
    let lon = position.coords.longitude;

    revSearch(lat, lon)
      .then((result) => {
        if (result) {
          if (loc) {
            loc.textContent = formatAddress(result);
          }
        }
        if (result.error) {
          console.log(result);
          let message = "API Error Message: ";
          if (result.error.message) {
            message += result.error.message;
          } else {
            message = result.error;
          }
          if (loc) {
            loc.textContent = message;
          }
        }
      })
      .catch((error) => {
        console.log(error);
        if (loc) {
          loc.textContent = "ERROR: Check console for info";
        }
      });
    if (markerLat && markerLon) {
      markerLat.textContent = `${lat}`;
      markerLon.textContent = `${lon}`;
    }
  }

  function browserGeoError() {
    console.error("Error with browser geolocation.");
  }

  function revSearch(lat, lon) {
    let url = new URL(revURL + "&lat=" + lat + "&lon=" + lon);
    return fetch(url)
      .then((response) => response.json())
      .then((data) => {
        return data;
      })
      .catch((error) => {
        console.log(error);
      });
  }

  function freeSearch(query) {
    let transformedQuery = query.replace(/ /g, "+");
    let url = new URL(searchURL + "&q=" + transformedQuery);
    return fetch(url)
      .then((response) => response.json())
      .then((data) => {
        return data;
      })
      .catch((error) => {
        console.log(error);
      });
  }

  function genMap(lat, lon) {
    // Initialize map if not already done, or update existing map
    if (!map) {
      map = L.map("mapContainer").setView([lat, lon], 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
    } else {
      map.setView([lat, lon], 13);
    }

    // Remove existing marker
    if (currentMarker) {
      map.removeLayer(currentMarker);
    }

    // Add new marker
    currentMarker = L.marker([currentLat, currentLon], {
      draggable: true,
    }).addTo(map);

    // Update coordinate displays
    if (markerLat) markerLat.textContent = currentLat.toFixed(6);
    if (markerLon) markerLon.textContent = currentLon.toFixed(6);

    // Update lat/lng inputs when marker is dragged
    if (latEl) latEl.value = currentLat.toFixed(6);
    if (lngEl) lngEl.value = currentLon.toFixed(6);

    currentMarker.on("drag", function (e) {
      let coord = e.latlng;
      let lat = coord.lat;
      let lng = coord.lng;
      if (markerLat) markerLat.textContent = lat.toFixed(6);
      if (markerLon) markerLon.textContent = lng.toFixed(6);
      if (latEl) latEl.value = lat.toFixed(6);
      if (lngEl) lngEl.value = lng.toFixed(6);
    });

    currentMarker.on("moveend", function (e) {
      let coord = e.target.getLatLng();
      let lat = coord.lat;
      let lng = coord.lng;
      if (markerLat) markerLat.textContent = lat.toFixed(6);
      if (markerLon) markerLon.textContent = lng.toFixed(6);
      if (latEl) latEl.value = lat.toFixed(6);
      if (lngEl) lngEl.value = lng.toFixed(6);
      let markerPosition = currentMarker.getLatLng();
      currentLat = markerPosition.lat;
      currentLon = markerPosition.lng;
      updateLoc(currentLat, currentLon);
    });
  }

  function formatAddress(addressData) {
    if (!addressData || !addressData.address) {
      return addressData?.display_name || "Address not available";
    }

    const {
      amenity = "",
      house_number = "",
      road = "",
      suburb,
      neighbourhood = suburb ?? "",
      town,
      county,
      municipality,
      city = town ?? county ?? municipality ?? "",
      region,
      state = region ?? "",
      postcode = "",
      country = "",
    } = addressData.address;

    const addressParts = [
      amenity,
      house_number,
      road,
      neighbourhood,
      city,
      addressData.address["ISO3166-2-lvl4"]
        ? addressData.address["ISO3166-2-lvl4"].split("-")[1]
        : state,
      postcode,
      country,
    ].filter(Boolean);

    // Only fall back to display_name if we have no meaningful address components
    if (addressParts.length === 0) {
      return addressData.display_name || "Address not available";
    }

    return addressParts.join(", ");
  }

  function updateLoc(lat, lon) {
    if (loc) {
      loc.textContent = "Getting location...";
    }
    revSearch(currentLat, currentLon)
      .then((result) => {
        const formattedAddress = formatAddress(result);
        if (loc) {
          loc.textContent = formattedAddress;
        }
      })
      .catch((error) => {
        if (loc) {
          loc.textContent = "";
        }
        console.log(error);
      });
  }

  async function initializeWithLocation() {
    try {
      updateLoc(currentLat, currentLon);
      genMap(currentLat, currentLon);
    } catch (error) {
      console.error("Failed to initialize with location:", error);
    }
  }

  async function tryAutoLocation() {
    try {
      await getLocation();
      await initializeWithLocation();
    } catch (error) {
      console.log("Auto-location failed:", error);
      if (loc) {
        loc.textContent =
          "Location access denied. Please search for a location manually.";
      }
    }
  }

  // initial
  fetchStatus();
  setInterval(fetchStatus, 8000);

  // Initialize map functionality
  tryAutoLocation();
})();
