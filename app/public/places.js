// Script for location selection, combination of Nonatim, Leaflet, and Foursquare API

// DECLARATIONS
// Buttons
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
let markerLat = document.getElementById("markerLat");
let markerLon = document.getElementById("markerLon");

// Venue search elements (for integration with Foursquare)
let latInput = document.getElementById("latitude");
let longInput = document.getElementById("longitude");
let radiusInput = document.getElementById("radius");
let submitButton = document.getElementById("submit");
let infoDiv = document.getElementById("places");

// URLs for access to Nonatim API
const revURL = "https://nominatim.openstreetmap.org/reverse?format=jsonv2";
const searchURL = "https://nominatim.openstreetmap.org/search?format=jsonv2";

// Global Variables
let map = null; // Add map variable for better management
let currentMarker = null;
let currentLat = null;
let currentLon = null;
let venueMarkersLayer = null; // Layer group for venue markers

// Function to update venue search coordinates
function updateVenueSearchCoords() {
  if (latInput && currentLat) {
    latInput.value = currentLat.toFixed(6);
  }
  if (longInput && currentLon) {
    longInput.value = currentLon.toFixed(6);
  }
}

// FUNCTIONS
// Browser geolocation functions
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
          browserLoc.textContent = formatAddress(result);
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
        if (browserLoc) {
          browserLoc.textContent = message;
        }
      }
    })
    .catch((error) => {
      console.log(error);
      if (browserLoc) {
        browserLoc.textContent = "ERROR: Check console for info";
      }
    });
  if (browserLat && browserLon) {
    browserLat.textContent = `${lat}`;
    browserLon.textContent = `${lon}`;
  }

  // Update venue search coordinates
  updateVenueSearchCoords();
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
  // Initialize map if not already done, or update existing map
  if (!map) {
    map = L.map("mapContainer").setView([lat, lon], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Initialize venue markers layer
    venueMarkersLayer = L.layerGroup().addTo(map);
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

  // Update venue search coordinates
  updateVenueSearchCoords();

  currentMarker.on("drag", function (e) {
    let coord = e.latlng;
    let lat = coord.lat;
    let lng = coord.lng;
    if (markerLat) markerLat.textContent = lat.toFixed(6);
    if (markerLon) markerLon.textContent = lng.toFixed(6);

    // Update venue search coordinates during drag
    if (latInput) latInput.value = lat.toFixed(6);
    if (longInput) longInput.value = lng.toFixed(6);
  });

  currentMarker.on("moveend", function (e) {
    let coord = e.target.getLatLng();
    let lat = coord.lat;
    let lng = coord.lng;
    if (markerLat) markerLat.textContent = lat.toFixed(6);
    if (markerLon) markerLon.textContent = lng.toFixed(6);
    let markerPosition = currentMarker.getLatLng();
    currentLat = markerPosition.lat;
    currentLon = markerPosition.lng;
    updateLoc(currentLat, currentLon);
    updateVenueSearchCoords();
  });
}

// Function to format address consistently
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

// updateLoc updates the currently displayed location above the map (usually called with currentLat and currentLon as args)
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

// Function to add venue markers to the map
function addVenueMarkers(places) {
  console.log("Adding venue markers for", places.length, "places");
  console.log("Map exists:", !!map);
  console.log("Venue markers layer exists:", !!venueMarkersLayer);

  // Ensure venue markers layer exists
  if (!venueMarkersLayer && map) {
    console.log("Creating venue markers layer");
    venueMarkersLayer = L.layerGroup().addTo(map);
  }

  // Clear existing venue markers
  if (venueMarkersLayer) {
    venueMarkersLayer.clearLayers();
  } else {
    console.warn("No venue markers layer available");
    return;
  }

  // Add markers for each venue
  places.forEach((place, index) => {
    console.log(`Processing place ${index + 1}:`, place.name, place);

    // Check for coordinates - Foursquare API returns latitude and longitude directly
    let lat, lng;
    if (place.latitude && place.longitude) {
      lat = place.latitude;
      lng = place.longitude;
    } else if (place.geocodes && place.geocodes.main) {
      // Fallback to geocodes.main if available
      lat = place.geocodes.main.latitude;
      lng = place.geocodes.main.longitude;
    } else if (
      place.location &&
      place.location.latitude &&
      place.location.longitude
    ) {
      // Fallback to location object if available
      lat = place.location.latitude;
      lng = place.location.longitude;
    }

    if (lat && lng) {
      console.log(`Adding marker at ${lat}, ${lng}`);

      // Create custom icon for venues (different color than main marker)
      let venueIcon = L.divIcon({
        className: "venue-marker",
        html: '<div style="background-color: #ff6b6b; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      // Create marker with popup
      let marker = L.marker([lat, lng], { icon: venueIcon });

      // Create popup content
      let popupContent = `
        <div class="venue-popup">
          <strong>${place.name}</strong><br>
          ${place.location.formatted_address || "Address not available"}<br>
          ${
            place.distance
              ? `Distance: ${place.distance}m`
              : "Distance: Not available"
          }<br>
          ${
            place.categories && place.categories.length > 0
              ? `<em>${place.categories
                  .map((cat) => cat.name)
                  .join(", ")}</em><br>`
              : ""
          }
          ${
            place.website
              ? `<a href="${place.website}" target="_blank" rel="noopener noreferrer" class="website-link">Visit Website</a><br>`
              : ""
          }
          ${
            place.tel
              ? `<a href="tel:${place.tel}" class="place-phone-link">📞 ${place.tel}</a>`
              : ""
          }
        </div>
      `;

      marker.bindPopup(popupContent);
      venueMarkersLayer.addLayer(marker);
      console.log(`Added marker for ${place.name}`);
    } else {
      console.warn("Missing coordinates for place:", place.name, place);
    }
  });

  console.log("Finished adding venue markers");
}

// Function to clear venue markers
function clearVenueMarkers() {
  if (venueMarkersLayer) {
    venueMarkersLayer.clearLayers();
  }
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
    if (loc) {
      loc.textContent =
        "Location access denied. Please search for a location manually.";
    }
  }
}

// attempt to get browser location
tryAutoLocation();

// Button clicks
if (searchButton) {
  searchButton.addEventListener("click", () => {
    let searchText = search.value;
    if (searchMessage) {
      searchMessage.textContent = "Getting results...";
    }

    while (searchResults && searchResults.firstChild) {
      searchResults.removeChild(searchResults.firstChild);
    }

    // .then() to handle result
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

// Store all fetched places globally for filtering
let allPlaces = [];

// Function to clear all previous results and filters
function clearAllPreviousResults() {
  // Clear the main results display
  while (infoDiv.firstChild) {
    infoDiv.removeChild(infoDiv.firstChild);
  }

  // Clear all places data
  allPlaces = [];

  // Clear venue markers from the map
  clearVenueMarkers();

  // Clear filter content if it exists
  let filterContent = document.getElementById("filterContent");
  if (filterContent) {
    while (filterContent.firstChild) {
      filterContent.removeChild(filterContent.firstChild);
    }
  }
}

// Foursquare venue search functionality
function findPlaces() {
  console.log("clicked");
  let latitude = latInput.value;
  let longitude = longInput.value;
  let radius = radiusInput.value || 3000; // Default to 3000 meters if no radius specified

  if (!latitude || !longitude) {
    displayError(
      "Please set a location first by searching for an address or allowing location access."
    );
    return;
  }

  // Clear all previous results and filters
  clearAllPreviousResults();

  // Show loading message
  let loadingDiv = document.createElement("div");
  loadingDiv.className = "card";
  let loadingText = document.createElement("p");
  loadingText.textContent = "Searching for places...";
  loadingDiv.appendChild(loadingText);
  infoDiv.appendChild(loadingDiv);

  fetch(`/api/places?lat=${latitude}&long=${longitude}&radius=${radius}`)
    .then((res) => res.json())
    .then((res) => {
      console.log("API Response:", res);
      allPlaces = res.results || [];
      console.log("All places:", allPlaces);

      // Log sample place structure
      if (allPlaces.length > 0) {
        console.log("Sample place structure:", allPlaces[0]);
      }

      // Display all places initially
      displayAllPlaces();

      // Enable filtering now that we have data
      enableFiltering();
    })
    .catch((err) => {
      console.log(err);
      displayError("Error searching for places. Please try again.");
    });
}

function displayAllPlaces() {
  // Clear previous results
  while (infoDiv.firstChild) {
    infoDiv.removeChild(infoDiv.firstChild);
  }

  if (allPlaces.length === 0) {
    displayError("No places found in this area.");
    return;
  }

  // Add filter controls at the top
  createFilterControls();

  // Display all places
  displayPlaces(allPlaces);
}

function createFilterControls() {
  // Get the existing filter content container
  let filterContent = document.getElementById("filterContent");
  if (!filterContent) {
    console.error("filterContent container not found");
    return;
  }

  // Clear any existing content
  while (filterContent.firstChild) {
    filterContent.removeChild(filterContent.firstChild);
  }

  // Create header section with title and search input
  let filterHeader = document.createElement("div");
  filterHeader.className = "filter-header";

  let filterTitle = document.createElement("h4");
  filterTitle.textContent = "Filter Results";

  // Add category search input next to title
  let categorySearchInput = document.createElement("input");
  categorySearchInput.type = "text";
  categorySearchInput.placeholder =
    "Search by category (e.g., restaurant, cafe, shop...)";
  categorySearchInput.className = "category-search-input";

  filterHeader.appendChild(filterTitle);
  filterHeader.appendChild(categorySearchInput);

  // Add event listener to the search input
  categorySearchInput.addEventListener("input", (e) => {
    let searchTerm = e.target.value.toLowerCase();
    if (searchTerm === "") {
      // Clear all checkboxes when search is cleared and reset styling
      let checkboxes = document.querySelectorAll(
        "#filterContent input[type='checkbox']"
      );
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
        let label = checkbox.nextElementSibling;
        if (label) {
          label.classList.remove("btn-primary");
          label.classList.add("btn-ghost");
        }
      });
      displayPlaces(allPlaces);
      updateActiveFilter(showAllBtn);
    } else {
      // Clear checkboxes when using search and reset styling
      let checkboxes = document.querySelectorAll(
        "#filterContent input[type='checkbox']"
      );
      checkboxes.forEach((checkbox) => {
        checkbox.checked = false;
        let label = checkbox.nextElementSibling;
        if (label) {
          label.classList.remove("btn-primary");
          label.classList.add("btn-ghost");
        }
      });

      let filteredPlaces = allPlaces.filter((place) => {
        return place.categories.some((category) =>
          category.name.toLowerCase().includes(searchTerm)
        );
      });
      displayPlaces(filteredPlaces);
      updateActiveFilter(null); // Clear active filter for custom search
    }
  });

  // Create buttons container that spans full width
  let filterButtons = document.createElement("div");
  filterButtons.className = "filter-buttons";

  let filterForm = document.createElement("div");

  // Show all button
  let showAllBtn = document.createElement("button");
  showAllBtn.textContent = "Show All Places";
  showAllBtn.className = "btn btn-ghost";
  showAllBtn.addEventListener("click", () => {
    // Clear all checkboxes and reset their label styling
    let checkboxes = document.querySelectorAll(
      "#filterContent input[type='checkbox']"
    );
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
      let label = checkbox.nextElementSibling;
      if (label) {
        label.classList.remove("btn-primary");
        label.classList.add("btn-ghost");
      }
    });
    displayPlaces(allPlaces);
    updateActiveFilter(showAllBtn);
  });

  filterButtons.appendChild(showAllBtn);

  // Get unique categories from all places and create filter buttons
  let uniqueCategories = new Set();
  allPlaces.forEach((place) => {
    if (place.categories) {
      place.categories.forEach((category) => {
        uniqueCategories.add(category.name);
      });
    }
  });

  // Create filter checkboxes for each unique category
  Array.from(uniqueCategories)
    .sort()
    .forEach((categoryName) => {
      let filterWrapper = document.createElement("div");
      filterWrapper.className = "filter-checkbox-wrapper";

      let filterCheckbox = document.createElement("input");
      filterCheckbox.type = "checkbox";
      filterCheckbox.className = "filter-checkbox";
      filterCheckbox.id = `category-${categoryName
        .replace(/\s+/g, "-")
        .toLowerCase()}`;
      filterCheckbox.addEventListener("change", () => {
        filterBySelectedCategories();
        // Update label styling based on checkbox state
        if (filterCheckbox.checked) {
          filterLabel.classList.remove("btn-ghost");
          filterLabel.classList.add("btn-primary");
        } else {
          filterLabel.classList.remove("btn-primary");
          filterLabel.classList.add("btn-ghost");
        }
      });

      let filterLabel = document.createElement("label");
      filterLabel.htmlFor = filterCheckbox.id;
      filterLabel.textContent = categoryName;
      filterLabel.className = "btn btn-ghost filter-label";

      filterWrapper.appendChild(filterCheckbox);
      filterWrapper.appendChild(filterLabel);
      filterButtons.appendChild(filterWrapper);
    });

  filterForm.appendChild(filterButtons);

  filterContent.appendChild(filterHeader);
  filterContent.appendChild(filterForm);

  // Set "Show All" as initially active
  updateActiveFilter(showAllBtn);
}

function updateActiveFilter(activeButton) {
  // Remove active class from all filter buttons
  let filterButtons = document.querySelectorAll("#filterContent button");
  filterButtons.forEach((btn) => {
    btn.classList.remove("btn-primary");
    btn.classList.add("btn-ghost");
  });

  // Add active class to the clicked button
  if (activeButton) {
    activeButton.classList.remove("btn-ghost");
    activeButton.classList.add("btn-primary");
  }
}

function filterBySelectedCategories() {
  // Clear the search input when using checkboxes
  let searchInput = document.querySelector("#filterContent input[type='text']");
  if (searchInput) {
    searchInput.value = "";
  }

  // Get all checked categories
  let checkedCategories = [];
  let checkboxes = document.querySelectorAll(
    "#filterContent input[type='checkbox']:checked"
  );
  checkboxes.forEach((checkbox) => {
    let categoryName = checkbox.nextElementSibling.textContent;
    checkedCategories.push(categoryName);
  });

  // If no categories are selected, show all places
  if (checkedCategories.length === 0) {
    displayPlaces(allPlaces);
    updateActiveFilter(document.querySelector("#filterContent button")); // Show All button
    return;
  }

  // Filter places that match any of the selected categories
  let filteredPlaces = allPlaces.filter((place) => {
    return (
      place.categories &&
      place.categories.some((category) =>
        checkedCategories.includes(category.name)
      )
    );
  });

  displayPlaces(filteredPlaces);
  updateActiveFilter(null); // Clear active filter for checkbox selections
}

function enableFiltering() {
  // Filtering is now automatically enabled after search results are loaded
  console.log("Filtering enabled with", allPlaces.length, "places");
}

function displayPlaces(places) {
  // Use the existing #places div which already has places-grid class
  let resultsContainer = infoDiv;

  // Clear existing results
  while (resultsContainer.firstChild) {
    resultsContainer.removeChild(resultsContainer.firstChild);
  }

  if (places.length === 0) {
    let noResultsCard = document.createElement("div");
    noResultsCard.className = "card no-results-card";
    let noResultsText = document.createElement("p");
    noResultsText.className = "no-results-text";
    noResultsText.textContent = "No places found matching your filter.";
    noResultsCard.appendChild(noResultsText);
    resultsContainer.appendChild(noResultsCard);
    // Clear venue markers when no results
    clearVenueMarkers();
    return;
  }

  // Add venue markers to map
  addVenueMarkers(places);

  for (let place of places) {
    let placeCard = document.createElement("div");
    placeCard.className = "place-card";

    let placeName = document.createElement("h4");
    placeName.className = "place-name";
    placeName.textContent = place.name;

    let placeAddress = document.createElement("div");
    placeAddress.className = "place-details";
    placeAddress.textContent =
      place.location.formatted_address || "Address not available";

    let placeDistance = document.createElement("div");
    placeDistance.className = "place-details";
    if (place.distance !== undefined && place.distance !== null) {
      placeDistance.textContent = `Distance: ${place.distance}m`;
    } else {
      placeDistance.textContent = "Distance: Not available";
    }

    // Add categories
    let placeCategories = document.createElement("div");
    placeCategories.className = "place-details categories";
    if (place.categories && place.categories.length > 0) {
      let categoryNames = place.categories.map((cat) => cat.name).join(", ");
      let categoriesLabel = document.createElement("strong");
      categoriesLabel.textContent = "Categories: ";
      placeCategories.appendChild(categoriesLabel);
      placeCategories.appendChild(document.createTextNode(categoryNames));
    }

    // Add website link
    let placeWebsite = document.createElement("div");
    placeWebsite.className = "place-details website";
    if (place.website) {
      let websiteLabel = document.createElement("strong");
      websiteLabel.textContent = "Website: ";
      let websiteLink = document.createElement("a");
      websiteLink.href = place.website;
      websiteLink.target = "_blank";
      websiteLink.rel = "noopener noreferrer";
      websiteLink.className = "place-website-link";
      websiteLink.textContent = place.website;
      placeWebsite.appendChild(websiteLabel);
      placeWebsite.appendChild(websiteLink);
    }

    // Add phone number
    let placePhone = document.createElement("div");
    placePhone.className = "place-details phone";
    if (place.tel) {
      let phoneLabel = document.createElement("strong");
      phoneLabel.textContent = "Phone: ";
      let phoneLink = document.createElement("a");
      phoneLink.href = `tel:${place.tel}`;
      phoneLink.className = "place-phone-link";
      phoneLink.textContent = place.tel;
      placePhone.appendChild(phoneLabel);
      placePhone.appendChild(phoneLink);
    }

    placeCard.appendChild(placeName);
    placeCard.appendChild(placeAddress);
    placeCard.appendChild(placeDistance);
    if (place.categories && place.categories.length > 0) {
      placeCard.appendChild(placeCategories);
    }
    if (place.website) {
      placeCard.appendChild(placeWebsite);
    }
    if (place.tel) {
      placeCard.appendChild(placePhone);
    }

    resultsContainer.appendChild(placeCard);
  }
}

function displayError(message) {
  while (infoDiv.firstChild) {
    infoDiv.removeChild(infoDiv.firstChild);
  }

  let errorCard = document.createElement("div");
  errorCard.className = "card error-card";
  let errorText = document.createElement("p");
  errorText.textContent = message;
  errorCard.appendChild(errorText);
  infoDiv.appendChild(errorCard);
}

if (submitButton) {
  submitButton.addEventListener("click", findPlaces);
}
