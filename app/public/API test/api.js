// Basic Nonatim API requests with lat/lon search and freeform search
// DECLARATIONS
// Buttons
let getLocButton = document.getElementById("getLoc");
let coordsButton = document.getElementById("submitCoords");
let searchButton = document.getElementById("submitAddress");
let genMapButton = document.getElementById("generateMap");

// Browser geolocation display elements
let browserLoc = document.getElementById("browserLoc");
let browserLat = document.getElementById("browserLat");
let browserLon = document.getElementById("browserLon");

// revSearch input and display elements
let latitude = document.getElementById("lat");
let longitude = document.getElementById("lon");
let loc = document.getElementById("location");
let coordsCode = document.getElementById("coordsCode");
let coordsMessage = document.getElementById("coordsMsg");

// freeSearch input and display elements
let search = document.getElementById("search");
let searchTable = document.getElementById("tbody");
let searchCode = document.getElementById("searchCode");
let searchMessage = document.getElementById("searchMsg");

// Leaflet map div
let mapContainer = document.getElementById("mapContainer");

// URLs for access to Nonatim API
const revURL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
const searchURL = "https://nominatim.openstreetmap.org/search?format=jsonv2";

// FUNCTIONS
// Browser geolocation functions (direct DOM manipulation, alter to need)
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        browserGeoSuccess,
        browserGeoError
    );
  } else {
    browserLoc.textContent =
        "Error: Geolocation is not supported by this browser.";
  }
}

function browserGeoSuccess(position) {
  let lat = position.coords.latitude;
  let lon = position.coords.longitude;

  revSearch(lat, lon)
      .then((result) => {
        if (result) {
          browserLoc.textContent = result.display_name;
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
  browserLat.textContent = `${lat}`;
  browserLon.textContent = `${lon}`;
}

function browserGeoError() {
  browserLoc.textContent = "Browser geolocation error, no position available.";
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

// Button clicks
getLocButton.addEventListener("click", () => {
  browserLoc.textContent = "Getting location...";
  browserLat.textContent = "";
  browserLon.textContent = "";

  getLocation();
});

searchButton.addEventListener("click", () => {
  let searchText = search.value;

  searchCode.textContent = "";
  searchMessage.textContent = "";
  while (searchTable.firstChild) {
    searchTable.removeChild(searchTable.firstChild);
  }

  // .then() to handle result
  freeSearch(searchText)
      .then((result) => {
        if (result) {
          for (let i = 0; i < result.length; i++) {
            let tr = document.createElement("tr");
            let resultNum = document.createElement("td");
            let resultLoc = document.createElement("td");
            let lat = document.createElement("td");
            let lon = document.createElement("td");

            resultNum.textContent = `${i + 1}`;
            resultLoc.textContent = result[i].display_name;
            lat.textContent = result[i].lat;
            lon.textContent = result[i].lon;

            tr.append(resultNum);
            tr.append(resultLoc);
            tr.append(lat);
            tr.append(lon);
            searchTable.append(tr);
          }
        }
        if (result.error) {
          let code = "Error Code: ";
          let message = "Error Message: ";
          if (result.error.code || result.error.message) {
            code += result.error.code;
            message += result.error.message;
          } else {
            code += "400";
            message = result.error;
          }
          searchCode.textContent = code;
          searchMessage.textContent = message;
        }

        if (result.length <= 0) {
          searchCode.textContent = "Error Code: 400";
          searchMessage.textContent =
              "Error Message: No results returned, please try again with a different search";
        }
      })
      .catch((error) => {
        console.log(error);
        searchMessage.textContent = "ERROR: Check console for info";
      });
});

coordsButton.addEventListener("click", () => {
  loc.textContent = "";
  coordsCode.textContent = "";
  coordsMessage.textContent = "";
  let latVal = latitude.value;
  let lonVal = longitude.value;

  // .then() to handle result
  revSearch(latVal, lonVal)
    .then((result) => {
      if (result) {
        loc.textContent = result.display_name;
      }

      if (result.error) {
        let code = "Error Code: ";
        let message = "Error Message: ";
        if (result.error.code || result.error.message) {
          code += result.error.code;
          message += result.error.message;
        } else {
          code += "400";
          message = result.error;
        }
        coordsCode.textContent = code;
        coordsMessage.textContent = message;
      }
    })
    .catch((error) => {
      console.log(error);
      coordsMessage.textContent = "ERROR: Check console for info";
    });
});

genMapButton.addEventListener("click", () => {
  while (mapContainer.firstChild) {
    mapContainer.removeChild(mapContainer.firstChild);
  };
  let newMap = document.createElement("div");
  newMap.id = "map";
  mapContainer.append(newMap);
  let latVal = latitude.value;
  let lonVal = longitude.value;
  let map = L.map('map').setView([latVal, lonVal], 13)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  let marker = L.marker([latVal, lonVal]).addTo(map);
});
