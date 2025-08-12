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

    fetch(`/api/places?lat=${latitude}&long=${longitude}`)
    .then(res => res.json())
    .then(res => {
        console.log(res);
        let places = searchVenues(categoryIds[venue], res.results);
        console.log(places);
    })
    .catch(err => console.log(err));
}

function searchVenues(venue, list) {
    let matches = [];
    for (let place of list) {
        for (let category of place.categories) {
            if (venue === category.fsq_category_id) {
                matches.push(place);
            }
        }
    }
    return matches;
}

submitButton.addEventListener("click", findPlaces);