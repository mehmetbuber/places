async function init() {
  await customElements.whenDefined("gmp-map");

  const map = document.querySelector("gmp-map");
  const placePicker = document.querySelector("gmpx-place-picker");
  const infowindow = new google.maps.InfoWindow();
  const searchButton = document.querySelector("#search"); // Button to trigger search
  const downloadButton = document.querySelector("#download-kmz"); // Button to download KMZ file
  const radiusInput = document.querySelector("#radius"); // Input field for search radius
  const minRatingInput = document.querySelector("#min-rating"); // Input field for minimum rating
  const typeInput = document.querySelector("#type"); // Input field for place type
  const keywordInput = document.querySelector("#keyword"); // Input field for keyword search
  const saveButton = document.querySelector("#save-json"); // Button to save data as JSON
  const importButton = document.querySelector("#import-json"); // Button to import JSON data
  const deleteButton = document.querySelector("#delete"); // Button to import JSON data
  const showLabelsButton = document.querySelector("#show-labels"); // Button to show all labels
  const hideLabelsButton = document.querySelector("#hide-labels"); // Button to hide all labels
  const showCirclesButton = document.querySelector("#show-circles"); // Button to show all circles
  const hideCirclesButton = document.querySelector("#hide-circles"); // Button to hide all circles

  let markers = [];
  let labels = [];
  let selectedPlace = undefined;

  let placesData = []; // Array to store all fetched places
  let searchedAreas = []; // Array to store searched center points and radii
  let currentCenterCircle = null; // Circle to indicate the current search area
  let radius = 1000; // Default search radius in meters
  let rating = 4.0; // Default minimum rating for places
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

  minRatingInput.addEventListener("input", () => {
    rating = parseFloat(minRatingInput.value);
  });

  // Configure map options for satellite view without labels
  map.innerMap.setOptions({
    center: { lat: 41.11386214265593, lng: 29.054110241449372 },
    zoom: 15,
    mapTypeId: "satellite",
  });

  // Function to draw a circle on the map
  function drawCircle(center, radius, options = {}) {
    console.log(showCirclesButton.style.display)
    const circle = new google.maps.Circle({
      strokeColor: options.strokeColor || "#ececec",
      strokeOpacity: options.strokeOpacity || 0.8,
      strokeWeight: options.strokeWeight || 2,
      fillColor: options.fillColor || "#ececec",
      fillOpacity: options.fillOpacity || 0.1,
      map: hideCirclesButton.style.display === "none" ? null : map.innerMap,
      center: center,
      radius: radius,
    });
    searchedAreas.push(circle); // Add to searched areas if it's a permanent circle
    return circle;
  }
  
  function drawCircle2(center, radius, options = {}) {
    const circle = new google.maps.Circle({
      strokeColor: options.strokeColor || "#ececec",
      strokeOpacity: options.strokeOpacity || 0.8,
      strokeWeight: options.strokeWeight || 2,
      fillColor: options.fillColor || "#ececec",
      fillOpacity: 0,
      map: map.innerMap,
      center: center,
      radius: radius,
      isTemporary: true,
    });
    currentCenterCircle = circle; // Keep track of the temporary circle
    return circle;
  }

  // Function to update the temporary circle
  function updateCenterCircle() {
    const center = map.innerMap.getCenter();

    if (currentCenterCircle) {
      currentCenterCircle.setMap(null); // Remove the existing circle
    }

    drawCircle2(center.toJSON(), radius);
  }

  // Update the center circle whenever the map is moved
  map.innerMap.addListener("center_changed", updateCenterCircle);

  // Function to fetch places via Places API with pagination
  async function fetchPlaces() {
    map.innerMap.setOptions({
      gestureHandling: "none", // Disables all gestures (dragging, zooming, scrolling)
      draggable: false, // Specifically prevents dragging
      zoomControl: false, // Hides the zoom control UI
      scrollwheel: false, // Disables zooming with the mouse wheel
      disableDoubleClickZoom: true, // Disables zooming on double-click
    });

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
      let total = 0;
      const handleResults = (results, status, pagination) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          results
            .filter((place) => place.rating && place.rating >= rating) // Filter places with rating >= 4.0
            .forEach((place) => {
              // Check for duplicates before adding to the array
              const index = placesData.findIndex(
                (p) => p.place_id === place.place_id
              );
              if (index === -1) {
                placesData.push(place);
                createMarker(place);
              }
            });
          total += results.length;

          // If there are more pages of results, fetch them
          if (pagination && pagination.hasNextPage) {
            setTimeout(() => pagination.nextPage(), 1000); // Add a delay to prevent rate-limiting
          } else {
            searchButton.disabled = false; // Enable the search button after all results are fetched

            map.innerMap.setOptions({
              gestureHandling: "auto", // Restores default gesture handling
              draggable: true, // Enables dragging
              zoomControl: true, // Shows the zoom control UI
              scrollwheel: true, // Enables zooming with the mouse wheel
              disableDoubleClickZoom: false, // Enables double-click zoom
            });

            if (total == 60)
              alert(
                "Maximum limit reached. Please zoom in to get more results."
              );
          }
        } else {
          console.error("Places API request failed with status: " + status);
          searchButton.disabled = false; // Enable the search button after all results are fetched

          map.innerMap.setOptions({
            gestureHandling: "auto", // Restores default gesture handling
            draggable: true, // Enables dragging
            zoomControl: true, // Shows the zoom control UI
            scrollwheel: true, // Enables zooming with the mouse wheel
            disableDoubleClickZoom: false, // Enables double-click zoom
          });
        }
      };

      service.nearbySearch(request, handleResults);
    });
  }

  function createMarker(place) {
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
        const position = projection.fromLatLngToDivPixel(this.position);

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
    const label = new LabelOverlay(place.geometry.location, place.name);
    label.setMap(map.innerMap);
    marker.addListener("click", () => {
      console.log("marker click", place);
      selectedPlace = { ...place };
      deleteButton.disabled = false;
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

      infowindow.addListener("closeclick", () => {
        console.log("infowindow closeclick");
        // Clear the selected place when the InfoWindow is closed
        selectedPlace = undefined;
        deleteButton.disabled = true;
      });

      infowindow.open(map.innerMap, marker);
    });

    markers.push(marker);
    labels.push(label);
  }

  showAllLabels = () => {
    labels.forEach((label) => label.setMap(map.innerMap));
    showLabelsButton.style.display = "none";
    hideLabelsButton.style.display = "block";
  };
  hideAllLabels = () => {
    labels.forEach((label) => label.setMap(null));
    showLabelsButton.style.display = "block";
    hideLabelsButton.style.display = "none";
  };

  showAllCircles = () => {
    searchedAreas.forEach((circle) => circle.setMap(map.innerMap));
    showCirclesButton.style.display = "none";
    hideCirclesButton.style.display = "block";
  };

  hideAllCircles = () => {
    searchedAreas.forEach((circle) => circle.setMap(null));
    showCirclesButton.style.display = "block";
    hideCirclesButton.style.display = "none";
  };

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

  function saveProgress() {
    const progress = {
      placesData: placesData,
      searchedAreas: searchedAreas.map((circle) => ({
        center: circle.getCenter().toJSON(),
        radius: circle.getRadius(),
      })),
    };

    const blob = new Blob([JSON.stringify(progress, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "progress.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function importProgress(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const progress = JSON.parse(e.target.result);

      placesData = progress.placesData;
      placesData.forEach((place) => {
        createMarker(place);
      });

      // searchedAreas.forEach((circle) => circle.setMap(null));

      searchedAreas = [];
      for (let i = 0; i < progress.searchedAreas.length; i++) {
        const area = progress.searchedAreas[i];
        const circle = drawCircle(area.center, area.radius, {
          strokeColor: "#ececec",
          fillColor: "#ececec",
          fillOpacity: 0.1,
        });
        searchedAreas.push(circle);
      }
    };

    reader.readAsText(file);
  }

  function deletePlace() {
    if (!selectedPlace) {
      alert("Please select a place to delete.");
      return;
    }
    clearAllMarkers();

    const index = placesData.findIndex(
      (p) => p.place_id === selectedPlace.place_id
    );

    if (index > -1) {
      placesData.splice(index, 1);
    }
    console.log("placesData", placesData.length);
    redrawPlaces();

    selectedPlace = undefined;
    deleteButton.disabled = true;
  }

  function clearAllMarkers() {
    markers.forEach((marker) => marker.setMap(null));
    labels.forEach((label) => label.setMap(null));

    markers = [];
    labels = [];
  }

  function redrawPlaces() {
    clearAllMarkers();
    placesData.forEach((place) => {
      createMarker(place);
    });
  }

  saveButton.addEventListener("click", saveProgress);
  importButton.addEventListener("change", importProgress);

  // Add event listener to the search button
  searchButton.addEventListener("click", fetchPlaces);

  // Add event listener to the download button
  downloadButton.addEventListener("click", exportToKMZ);
  deleteButton.addEventListener("click", deletePlace);

  showLabelsButton.addEventListener("click", showAllLabels);
  hideLabelsButton.addEventListener("click", hideAllLabels);

  showCirclesButton.addEventListener("click", showAllCircles);
  hideCirclesButton.addEventListener("click", hideAllCircles);

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
