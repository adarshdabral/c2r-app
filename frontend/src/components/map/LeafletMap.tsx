import { useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export type LatLng = { lat: number; lng: number };
export type MapMarker = {
  id: string | number;
  lat: number;
  lng: number;
  color?: string;
  selected?: boolean;
};

/**
 * OpenStreetMap map rendered with Leaflet inside a WebView. This replaces
 * react-native-maps, whose Android provider (Google Maps) renders a blank map
 * in Expo Go without an API key. Leaflet needs no key and works identically on
 * Android and iOS in Expo Go.
 *
 * Bridge: the web posts `ready`, `map_press` (tap coords), and `marker_press`
 * (marker id) to RN; RN pushes state (center/markers/route) via injected JS.
 * The map only re-centers when `center` actually changes, so moving a marker
 * (e.g. tapping to place a pin) doesn't yank the viewport.
 */
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body,#map{height:100%;margin:0;padding:0;background:#e8efe9;}
  .leaflet-container{background:#e8efe9;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var RN = window.ReactNativeWebView;
  var map, markerLayer, routeLayer, tapMode = false, lastCenterKey = "";
  function post(o){ if (RN) RN.postMessage(JSON.stringify(o)); }
  function pin(color){
    return L.divIcon({
      className: "",
      html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:'+color+';border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
      iconSize: [22,22], iconAnchor: [11,22]
    });
  }
  function init(){
    map = L.map("map", { zoomControl: true, attributionControl: false }).setView([20.5937,78.9629], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    markerLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    map.on("click", function(e){ if (tapMode) post({ type:"map_press", lat:e.latlng.lat, lng:e.latlng.lng }); });
    post({ type:"ready" });
  }
  window.__apply = function(d){
    try {
      tapMode = !!d.tapToPlace;
      if (d.center && typeof d.center.lat === "number"){
        var key = d.center.lat.toFixed(5)+","+d.center.lng.toFixed(5)+"@"+(d.zoom||"");
        if (key !== lastCenterKey){ lastCenterKey = key; map.setView([d.center.lat,d.center.lng], d.zoom || map.getZoom()); }
      }
      markerLayer.clearLayers();
      (d.markers||[]).forEach(function(m){
        var color = m.selected ? "#16a34a" : (m.color || "#4f46e5");
        L.marker([m.lat,m.lng], { icon: pin(color) }).addTo(markerLayer)
          .on("click", function(){ post({ type:"marker_press", id: m.id }); });
      });
      if (d.userLocation && typeof d.userLocation.lat === "number"){
        L.circleMarker([d.userLocation.lat,d.userLocation.lng], { radius:7, color:"#fff", weight:2, fillColor:"#0a84ff", fillOpacity:1 }).addTo(markerLayer);
      }
      routeLayer.clearLayers();
      if (Array.isArray(d.route) && d.route.length){
        L.polyline(d.route.map(function(p){ return [p.lat,p.lng]; }), { color:"#2563eb", weight:4 }).addTo(routeLayer);
      }
    } catch (err){ post({ type:"error", message: String(err) }); }
  };
  if (window.L) init(); else window.addEventListener("load", init);
</script>
</body>
</html>`;

export function LeafletMap({
  center,
  zoom = 13,
  markers = [],
  userLocation = null,
  route = null,
  tapToPlace = false,
  onMapPress,
  onMarkerPress,
  className,
}: {
  center?: LatLng | null;
  zoom?: number;
  markers?: MapMarker[];
  userLocation?: LatLng | null;
  route?: LatLng[] | null;
  tapToPlace?: boolean;
  onMapPress?: (lat: number, lng: number) => void;
  onMarkerPress?: (id: string | number) => void;
  className?: string;
}) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);

  const payload = useMemo(
    () => JSON.stringify({ center, zoom, markers, userLocation, route, tapToPlace }),
    [center, zoom, markers, userLocation, route, tapToPlace]
  );
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    if (ready.current) ref.current?.injectJavaScript(`window.__apply(${payload}); true;`);
  }, [payload]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "ready") {
      ready.current = true;
      ref.current?.injectJavaScript(`window.__apply(${payloadRef.current}); true;`);
    } else if (msg.type === "map_press") {
      onMapPress?.(msg.lat, msg.lng);
    } else if (msg.type === "marker_press") {
      onMarkerPress?.(msg.id);
    }
  };

  return (
    <View className={className ?? "min-h-[240px] flex-1 overflow-hidden rounded-2xl bg-accent"}>
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html: HTML }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        // Let the map pan on Android without the parent ScrollView stealing the gesture.
        nestedScrollEnabled
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
        style={{ flex: 1, backgroundColor: "transparent" }}
      />
    </View>
  );
}
