/* global L */

export function createMapController(mapElId) {
  const mapEl = document.getElementById(mapElId);
  const map = L.map(mapElId, { zoomControl: false }).setView([20, 0], 2);

  L.control.zoom({ position: "bottomleft" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const markers = new Map(); // spotId -> L.Marker
  let pickCallback = null;
  let tempMarker = null;

  function pinIcon(temp = false) {
    return L.divIcon({
      className: "",
      html: `<div class="spot-pin${temp ? " is-temp" : ""}"><div class="spot-pin__dot"></div></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
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
  };
}
