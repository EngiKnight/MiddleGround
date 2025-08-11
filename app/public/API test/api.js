// Basic Nonatim API requests with lat/lon search and freeform search
// DECLARATIONS
// Buttons
let getLocButton = document.getElementById("getLoc");
let searchButton = document.getElementById("submitAddress");

// Browser geolocation display elements
let browserLoc = document.getElementById("browserLoc");
let browserLat = document.getElementById("browserLat");
let browserLon = document.getElementById("browserLon");

// revSearch input and display elements
let loc = document.getElementById("location");

// freeSearch input and display elements
let search = document.getElementById("search");
let searchMessage = document.getElementById("searchMsg");
let searchResults = document.getElementById("searchResultsContainer");

// Leaflet map div
let mapContainer = document.getElementById("mapContainer");

// Marker Coords
let markerCoords = document.getElementById("markerLatLng");

// URLs for access to Nonatim API
const revURL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
const searchURL = "https://nominatim.openstreetmap.org/search?format=jsonv2";

// Global Variables
let currentMarker = null;
let currentLat = null;
let currentLon = null;

// FUNCTIONS
// Browser geolocation functions (direct DOM manipulation, alter to need)
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
      browserLoc.textContent = "Error: " + errorMsg;
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
        if (browserLoc) {
          browserLoc.textContent = result.display_name;
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
        browserLoc.textContent = message;
      }
    })
    .catch((error) => {
      console.log(error);
      browserLoc.textContent = "ERROR: Check console for info";
    });
  if (browserLat && browserLon) {
    browserLat.textContent = `${lat}`;
    browserLon.textContent = `${lon}`;
  }
}

function browserGeoError() {
  console.error("Error with browser geolocation.");
}

/*
revSearch returns a jsonv2 with the following example format

{
    "place_id":"134140761",
    "licence":"Data © OpenStreetMap contributors, ODbL 1.0. https:\/\/www.openstreetmap.org\/copyright",
    "osm_type":"way",
    "osm_id":"280940520",
    "lat":"-34.4391708",
    "lon":"-58.7064573",
    "place_rank":"26",
    "category":"highway",
    "type":"motorway",
    "importance":"0.1",
    "addresstype":"road",
    "display_name":"Autopista Pedro Eugenio Aramburu, El Triángulo, Partido de Malvinas Argentinas, Buenos Aires, 1.619, Argentina",
    "name":"Autopista Pedro Eugenio Aramburu",
    "address":{
        "road":"Autopista Pedro Eugenio Aramburu",
        "village":"El Triángulo",
        "state_district":"Partido de Malvinas Argentinas",
        "state":"Buenos Aires",
        "postcode":"1.619",
        "country":"Argentina",
        "country_code":"ar"
},
    "boundingbox":["-34.44159","-34.4370994","-58.7086067","-58.7044712"]
}
*/
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

//freeSearch returns an array of json objects with the same format, but in indices 0-n, where n is the number of results minus 1.
//freeSearch URL can be modified to add a limit parameter (such as &limit=1, would return same result as revSearch)
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

// genMap creates a leaflet map centered at given coordinates
function genMap(lat, lon) {
  while (mapContainer.firstChild) {
    mapContainer.removeChild(mapContainer.firstChild);
  }
  let newMap = document.createElement("div");
  newMap.id = "map";
  mapContainer.append(newMap);
  let map = L.map("map").setView([lat, lon], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  currentMarker = L.marker([currentLat, currentLon], {
    draggable: true,
  }).addTo(map);
  markerCoords.textContent =
    "Marker Position: " + currentLat + "; " + currentLon;

  currentMarker.on("drag", function (e) {
    let coord = e.latlng;
    let lat = coord.lat;
    let lng = coord.lng;
    markerCoords.textContent = "Marker Position: " + lat + "; " + lng;
  });

  currentMarker.on("moveend", function (e) {
    let coord = e.target.getLatLng();
    let lat = coord.lat;
    let lng = coord.lng;
    markerCoords.textContent = "Marker Position: " + lat + "; " + lng;
    let markerPosition = currentMarker.getLatLng();
    currentLat = markerPosition.lat;
    currentLon = markerPosition.lng;
    updateLoc(currentLat, currentLon);
  });
}

// updateLoc updates the currently displayed location above the map (usually called with currentLat and currentLon as args)
function updateLoc(lat, lon) {
  loc.textContent = "Getting location...";
  revSearch(currentLat, currentLon)
    .then((result) => {
      if (result) {
        loc.textContent = result.display_name;
      }
      if (result.error) {
        console.log(result.error);
      }
    })
    .catch((error) => {
      console.log(error);
    });
}

// initialize the page after getting coordinates
async function initializeWithLocation() {
  try {
    updateLoc(currentLat, currentLon);
    genMap(currentLat, currentLon);
  } catch (error) {
    console.error("Failed to initialize with location:", error);
  }
}

// Try to get location on page load
async function tryAutoLocation() {
  try {
    await getLocation();
    await initializeWithLocation();
  } catch (error) {
    console.log("Auto-location failed:", error);
    alert(
      "Browser auto-location failed. Please manually search for a location."
    );
  }
}

// attempt to get browser location
tryAutoLocation();

// Button clicks
searchButton.addEventListener("click", () => {
  let searchText = search.value;
  searchMessage.textContent = "Getting results...";

  while (searchResults.firstChild) {
    searchResults.removeChild(searchResults.firstChild);
  }

  // .then() to handle result
  freeSearch(searchText)
    .then((result) => {
      if (result) {
        for (let i = 0; i < result.length; i++) {
          let resultButton = document.createElement("button");
          resultButton.textContent = result[i].display_name;

          resultButton.addEventListener("click", async () => {
            currentLat = result[i].lat;
            currentLon = result[i].lon;

            await initializeWithLocation();

            while (searchResults.firstChild) {
              searchResults.removeChild(searchResults.firstChild);
            }
          });
          searchMessage.textContent = "";
          searchResults.append(resultButton);
        }
      }
      if (result.error) {
        console.log(result.error);
        let message = "Error Message: ";
        if (result.error.code || result.error.message) {
          message += result.error.message;
        } else {
          message = result.error;
        }
        searchMessage.textContent = message;
      }

      if (result.length <= 0) {
        searchMessage.textContent =
          "No results returned, please try again with a different search";
      }
    })
    .catch((error) => {
      console.log(error);
      searchMessage.textContent = "ERROR: Check console for info";
    });
});
