let keys = require("../env.json");
let foursquareKey = keys.foursquare;

let options = {
    method: "GET",
    headers: {
        accept: "application/json",
        "X-Places-Api-Version": "2025-06-17",
        "Authorization": `Bearer ${foursquareKey}`
    }
};

let apiUrl = "https://places-api.foursquare.com/places/search";

let categoryIds = {
    "Mini Golf": "52e81612bcbc57f1066b79eb",
    "Ice Cream": "4bf58dd8d48988d1c9941735",
    "Diner": "4bf58dd8d48988d147941735"
};

let latInput = document.getElementById("latitude");
let longInput = document.getElementById("longitude");
let venueInput = document.getElementById("venue");

let submitButton = document.getElementById("submit");

function findPlaces() {
    console.log("clicked");
    let latitude = latInput.value;
    let longitude = longInput.value;
    let venue = venueInput.value;

    let venueId = categoryIds[venue];

    fetch(apiUrl + `?ll=${latitude},${longitude}`, options)
    .then(res => res.json())
    .then(res => console.log(res))
    .catch(err => console.log(err));
}

submitButton.addEventListener("click", findPlaces);