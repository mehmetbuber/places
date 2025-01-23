async function init() {
  await customElements.whenDefined("gmp-map");

  const map = document.querySelector("gmp-map");
  const placePicker = document.querySelector("gmpx-place-picker");
  const infowindow = new google.maps.InfoWindow();
  const searchButton = document.querySelector("#search"); // Button to trigger search
  const downloadButton = document.querySelector("#download-kmz"); // Button to download KMZ file
  let placesData = []; // Array to store all fetched places
  let searchedAreas = []; // Array to store searched center points and radii
  let currentCenterCircle = null; // Circle to indicate the current search area

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
    const radius = 5000; // Example radius in meters

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
    const service = new google.maps.places.PlacesService(map.innerMap);
    const center = map.innerMap.getCenter(); // Get the center of the map
    const radius = 5000; // Search radius in meters
    const types = ["park"]; // Add multiple types to search

    // Draw a circle for the searched area
    drawCircle(center.toJSON(), radius);

    types.forEach((type) => {
      const request = {
        location: center, // Use the center of the screen as the search location
        radius: radius, // Search radius in meters
        type: type, // Dynamic type for each search
      };

      const handleResults = (results, status, pagination) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          results.forEach((place) => {
            const marker = new google.maps.Marker({
              position: place.geometry.location,
              map: map.innerMap,
              title: place.name,
              icon: {
                url: place.icon, // Use the icon returned by the API
                scaledSize: new google.maps.Size(24, 24), // Resize the icon to a smaller size
              },
            });

            marker.addListener("click", () => {
              infowindow.setContent(
                `<strong>${place.name}</strong><br>${place.vicinity}`
              );
              infowindow.open(map.innerMap, marker);
            });

            // Check for duplicates before adding to the array
            if (!placesData.some((p) => p.name === place.name && p.lat === place.geometry.location.lat() && p.lng === place.geometry.location.lng())) {
              placesData.push({
                name: place.name,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                type: type,
                icon: place.icon, // Store the icon for export if needed
              });
            }
          });

          // If there are more pages of results, fetch them
          if (pagination && pagination.hasNextPage) {
            setTimeout(() => pagination.nextPage(), 1000); // Add a delay to prevent rate-limiting
          }
        } else {
          console.error("Places API request failed with status: " + status);
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

    const kmzData = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2">',
      "<Document>",
    ];

    placesData.forEach((place) => {
      kmzData.push(
        `<Placemark>\n<name>${place.name}</name>\n<description>${place.type}</description>\n<Point>\n<coordinates>${place.lng},${place.lat}</coordinates>\n</Point>\n</Placemark>`
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
