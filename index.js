async function init() {
  await customElements.whenDefined("gmp-map");

  const map = document.querySelector("gmp-map");
  const placePicker = document.querySelector("gmpx-place-picker");
  const infowindow = new google.maps.InfoWindow();
  const searchButton = document.querySelector("#search"); // Button to trigger search
  const downloadButton = document.querySelector("#download-kmz"); // Button to download KMZ file
  const radiusInput = document.querySelector("#radius"); // Input field for search radius
  const typeInput = document.querySelector("#type"); // Input field for place type
  const keywordInput = document.querySelector("#keyword"); // Input field for keyword search

  let placesData = []; // Array to store all fetched places
  let searchedAreas = []; // Array to store searched center points and radii
  let currentCenterCircle = null; // Circle to indicate the current search area
  let radius = 1000; // Default search radius in meters
  let type = "park"; // Default place type for search
  let keyword = "";

  radiusInput.addEventListener("input", () => {
    radius = parseInt(radiusInput.value);
    updateCenterCircle();
  });

  typeInput.addEventListener("input", () => {
    type = typeInput.value;
  });

  keywordInput.addEventListener("input", () => {
    keyword = keywordInput.value;
  });

  // Configure map options for satellite view without labels
  map.innerMap.setOptions({
    mapTypeControl: true,
    mapTypeId: "satellite",
    styles: [
      {
        featureType: "all",
        elementType: "labels",
        stylers: [{ visibility: "off" }],
      },
    ],
    center: { lat: 41.0082, lng: 28.9784 }, // Coordinates for Istanbul
    zoom: 12, // Adjust the zoom level as needed
  });

  // Function to draw a circle on the map
  function drawCircle(center, radius, options = {}) {
    const circle = new google.maps.Circle({
      strokeColor: options.strokeColor || "#FF0000",
      strokeOpacity: options.strokeOpacity || 0.8,
      strokeWeight: options.strokeWeight || 2,
      fillColor: options.fillColor || "#FF0000",
      fillOpacity: options.fillOpacity || 0.2,
      map: map.innerMap,
      center: center,
      radius: radius,
    });

    if (options.isTemporary) {
      currentCenterCircle = circle; // Keep track of the temporary circle
    } else {
      searchedAreas.push(circle); // Add to searched areas if it's a permanent circle
    }
  }

  // Function to update the temporary circle
  function updateCenterCircle() {
    const center = map.innerMap.getCenter();

    if (currentCenterCircle) {
      currentCenterCircle.setMap(null); // Remove the existing circle
    }

    drawCircle(center.toJSON(), radius, {
      strokeColor: "#0000FF",
      fillColor: "#0000FF",
      fillOpacity: 0.1,
      isTemporary: true,
    });
  }

  // Update the center circle whenever the map is moved
  map.innerMap.addListener("center_changed", updateCenterCircle);

  // Function to fetch places via Places API with pagination
  async function fetchPlaces() {
    searchButton.disabled = true; // Disable the search button to prevent multiple requests
    const service = new google.maps.places.PlacesService(map.innerMap);
    const center = map.innerMap.getCenter(); // Get the center of the map
    const types = [type]; // Add multiple types to search

    // Draw a circle for the searched area
    drawCircle(center.toJSON(), radius);

    types.forEach((type) => {
      const request = {
        location: center, // Use the center of the screen as the search location
        radius: radius, // Search radius in meters
        type: type, // Dynamic type for each search
        rankBy: google.maps.places.RankBy.PROMINENCE, // Rank by prominence for more important places,
        keyword: keyword, // Search keyword
      };

      const handleResults = (results, status, pagination) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          results
            .filter((place) => place.rating && place.rating >= 4.0) // Filter places with rating >= 4.0
            .forEach((place) => {
              const marker = new google.maps.Marker({
                position: place.geometry.location,
                map: map.innerMap,
                title: place.name,
                icon: {
                  url: place.icon, // Use the icon returned by the API
                  scaledSize: new google.maps.Size(24, 24), // Resize the icon to a smaller size
                },
              });

              // Create a custom OverlayView for the label
              class LabelOverlay extends google.maps.OverlayView {
                constructor(position, text) {
                  super();
                  this.position = position;
                  this.text = text;
                  this.div = null;
                }

                onAdd() {
                  this.div = document.createElement("div");
                  this.div.style.position = "absolute";
                  this.div.style.backgroundColor = "rgba(255, 255, 255, 0.8)";
                  this.div.style.border = "1px solid #ccc";
                  this.div.style.borderRadius = "4px";
                  this.div.style.padding = "2px 6px";
                  this.div.style.fontSize = "12px";
                  this.div.style.fontWeight = "bold";
                  this.div.style.whiteSpace = "nowrap";
                  this.div.innerText = this.text;

                  const panes = this.getPanes();
                  panes.overlayLayer.appendChild(this.div);
                }

                draw() {
                  const projection = this.getProjection();
                  const position = projection.fromLatLngToDivPixel(
                    this.position
                  );

                  if (this.div) {
                    this.div.style.left = `${position.x}px`;
                    this.div.style.top = `${position.y}px`;
                  }
                }

                onRemove() {
                  if (this.div) {
                    this.div.parentNode.removeChild(this.div);
                    this.div = null;
                  }
                }
              }

              // Create and display the label
              const label = new LabelOverlay(
                place.geometry.location,
                place.name
              );
              label.setMap(map.innerMap);
              marker.addListener("click", () => {
                // Construct the image and Google Maps link
                const imageUrl = place.photos
                  ? place.photos[0].getUrl({ maxWidth: 300, maxHeight: 200 })
                  : "https://via.placeholder.com/300x200?text=No+Image"; // Placeholder if no image available
                const googleMapsLink = `https://www.google.com/maps/place/?q=place_id:${place.place_id}`;

                // Set the InfoWindow content with a delete button
                infowindow.setContent(
                  `<div id="infoWindowContent">
                    <strong>${place.name}</strong><br>
                    ${place.vicinity}<br>
                    <strong>Rating:</strong> ${place.rating}<br>
                    <img src="${imageUrl}" alt="${place.name}" style="width:100%; max-width:300px; height:auto; margin-top:8px;"><br>
                    <a href="${googleMapsLink}" target="_blank" style="text-decoration:none; color:blue;">View on Google Maps</a><br>
                  </div>`
                );
                infowindow.open(map.innerMap, marker);
              });

              // Check for duplicates before adding to the array
              if (
                !placesData.some(
                  (p) =>
                    p.name === place.name &&
                    p.lat === place.geometry.location.lat() &&
                    p.lng === place.geometry.location.lng()
                )
              ) {
                placesData.push({
                  name: place.name,
                  lat: place.geometry.location.lat(),
                  lng: place.geometry.location.lng(),
                  type: type,
                  icon: place.icon, // Store the icon for export if needed
                  rating: place.rating, // Store the rating
                  placeId: place.place_id, // Store place ID for future use
                });
              }
            });

          // If there are more pages of results, fetch them
          if (pagination && pagination.hasNextPage) {
            setTimeout(() => pagination.nextPage(), 1000); // Add a delay to prevent rate-limiting
          } else searchButton.disabled = false; // Enable the search button after all results are fetched
        } else {
          console.error("Places API request failed with status: " + status);
          searchButton.disabled = false; // Enable the search button after all results are fetched
        }
      };

      service.nearbySearch(request, handleResults);
    });
  }

  // Function to export places data as KMZ
  function exportToKMZ() {
    if (placesData.length === 0) {
      alert("No data to export. Please perform a search first.");
      return;
    }

    function sanitizeXML(str) {
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/'/g, "&apos;")
        .replace(/"/g, "&quot;");
    }

    const kmzData = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      "<Document>",
    ];

    placesData.forEach((place) => {
      kmzData.push(
        `<Placemark>\n<name>${sanitizeXML(
          place.name
        )}</name>\n<description>${sanitizeXML(
          place.type
        )}</description>\n<Point>\n<coordinates>${place.lng},${
          place.lat
        }</coordinates>\n</Point>\n</Placemark>`
      );
    });

    kmzData.push("</Document>", "</kml>");

    const blob = new Blob(kmzData, {
      type: "application/vnd.google-earth.kml+xml",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "places.kml";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Add event listener to the search button
  searchButton.addEventListener("click", fetchPlaces);

  // Add event listener to the download button
  downloadButton.addEventListener("click", exportToKMZ);

  placePicker.addEventListener("gmpx-placechange", () => {
    const place = placePicker.value;

    if (!place.location) {
      window.alert("No details available for input: '" + place.name + "'");
      infowindow.close();
      return;
    }

    if (place.viewport) {
      map.innerMap.fitBounds(place.viewport);
    } else {
      map.center = place.location;
      map.zoom = 17;
    }

    infowindow.setContent(
      `<strong>${place.displayName}</strong><br>
         <span>${place.formattedAddress}</span>
      `
    );
    infowindow.open(map.innerMap);
  });

  // Draw the initial center circle when the map loads
  updateCenterCircle();
}

document.addEventListener("DOMContentLoaded", init);
