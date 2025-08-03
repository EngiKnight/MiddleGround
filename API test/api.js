// Basic Nonatim API request using latitude and longitude coordinates
let button = document.getElementById("submit");
let latitude = document.getElementById("lat");
let longitude = document.getElementById("long");
let loc = document.getElementById("location");

const revURL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";

function revSearch(lat, lon) {
  let url = new URL(revURL + "&lat=" + lat + "&lon=" + lon);
  return fetch(url)
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
      return data;
    })
    .catch(console.error);
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

button.addEventListener("click", () => {
  loc.textContent = "";
  let latVal = latitude.value;
  let lonVal = longitude.value;

  // Use .then() to handle result
  revSearch(latVal, lonVal).then((result) => {
    if (result) {
      console.log(latVal);
      console.log(lonVal);
      console.log(result.display_name);
      loc.textContent = result.display_name;
    }
  });
});
