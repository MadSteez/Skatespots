/* global L */

// Covers Antwerp, Brussels, and Limburg comfortably — the default view
// before any spots (or a filtered view) narrow it down further.
const DEFAULT_BOUNDS = [
  [50.62, 3.85],
  [51.42, 6.05],
];

export function createMapController(mapElId) {
  const mapEl = document.getElementById(mapElId);
  const map = L.map(mapElId, { zoomControl: false });

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
  const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
  });
  streetLayer.addTo(map);
  let mapType = "street";

  function toggleMapType() {
    if (mapType === "street") {
      map.removeLayer(streetLayer);
      satelliteLayer.addTo(map);
      mapType = "satellite";
    } else {
      map.removeLayer(satelliteLayer);
      streetLayer.addTo(map);
      mapType = "street";
    }
    return mapType;
  }

  function showDefaultView() {
    map.fitBounds(DEFAULT_BOUNDS, { animate: false });
  }
  // Apply immediately (correct on desktop, where the container has real
  // size right away) and again shortly after invalidating size, in case
  // the container started at zero size (e.g. a hidden mobile pane).
  showDefaultView();
  setTimeout(() => {
    map.invalidateSize();
    showDefaultView();
  }, 100);

  const markers = new Map(); // spotId -> L.Marker
  let pickCallback = null;
  let tempMarker = null;

  function pinIcon(temp = false) {
    return L.divIcon({
      className: "",
      html: `<div class="spot-pin${temp ? " is-temp" : ""}"><div class="spot-pin__dot"></div><div class="spot-pin__tail"></div></div>`,
      iconSize: [28, 36],
      iconAnchor: [14, 31],
    });
  }

  function setSpots(spots, onClickSpot) {
    markers.forEach((m) => map.removeLayer(m));
    markers.clear();
    spots.forEach((spot) => {
      if (typeof spot.lat !== "number" || typeof spot.lng !== "number") return;
      const marker = L.marker([spot.lat, spot.lng], { icon: pinIcon() });
      marker.on("click", () => onClickSpot(spot.id));
      marker.addTo(map);
      markers.set(spot.id, marker);
    });
  }

  function fitToMarkers() {
    if (markers.size === 0) return;
    const group = L.featureGroup([...markers.values()]);
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
  }

  function focusSpot(id) {
    const m = markers.get(id);
    if (!m) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
  }

  function enablePickMode(onPick) {
    mapEl.style.cursor = "crosshair";
    pickCallback = onPick;
  }
  function disablePickMode() {
    mapEl.style.cursor = "";
    pickCallback = null;
  }
  function clearTempMarker() {
    if (tempMarker) {
      map.removeLayer(tempMarker);
      tempMarker = null;
    }
  }
  function placeTempMarker(lat, lng) {
    clearTempMarker();
    tempMarker = L.marker([lat, lng], { icon: pinIcon(true) }).addTo(map);
  }

  map.on("click", (e) => {
    if (!pickCallback) return;
    const { lat, lng } = e.latlng;
    placeTempMarker(lat, lng);
    pickCallback(lat, lng);
  });

  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 14, { animate: true }),
      () => {},
      { timeout: 8000 }
    );
  }

  function invalidateSize() {
    setTimeout(() => map.invalidateSize(), 60);
  }

  return {
    map,
    setSpots,
    fitToMarkers,
    focusSpot,
    enablePickMode,
    disablePickMode,
    clearTempMarker,
    placeTempMarker,
    locate,
    invalidateSize,
    toggleMapType,
  };
}
