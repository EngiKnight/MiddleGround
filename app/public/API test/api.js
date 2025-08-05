// Basic Nonatim API requests with lat/lon search and freeform search
let coordsButton = document.getElementById("submitCoords");
let searchButton = document.getElementById("submitAddress");
let latitude = document.getElementById("lat");
let longitude = document.getElementById("lon");
let loc = document.getElementById("location");
let coordsCode = document.getElementById("coordsCode");
let coordsMessage = document.getElementById("coordsMsg");
let search = document.getElementById("search");
let searchTable = document.getElementById("tbody");
let searchCode = document.getElementById("searchCode");
let searchMessage = document.getElementById("searchMsg");

const revURL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
const searchURL = "https://nominatim.openstreetmap.org/search?format=jsonv2";

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

coordsButton.addEventListener("click", () => {
  loc.textContent = "";
  coordsMessage.textContent = "";
  let latVal = latitude.value;
  let lonVal = longitude.value;

  // use .then() to handle result
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

searchButton.addEventListener("click", () => {
  let searchText = search.value;

  searchCode.textContent = "";
  searchMessage.textContent = "";
  while (tbody.firstChild) {
    tbody.removeChild(tbody.firstChild);
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
          tbody.append(tr);
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
