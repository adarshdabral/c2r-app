import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Text } from "@/components/ui";
import { LEAFLET_CSS, LEAFLET_JS } from "@/components/map/leaflet-inline";

export type LatLng = { lat: number; lng: number };
export type MapMarker = {
  id: string | number;
  lat: number;
  lng: number;
  color?: string;
  selected?: boolean;
};

/**
 * OpenStreetMap map rendered with Leaflet inside a WebView. Replaces
 * react-native-maps, whose Android provider (Google Maps) renders blank in Expo
 * Go without an API key.
 *
 * Leaflet's JS/CSS are INLINED (see leaflet-inline.ts), not loaded from a CDN —
 * Android's WebView blocks remote scripts from inline HTML (why the map worked
 * on iOS but was blank on Android). The only network use left is the OSM tiles.
 * `invalidateSize()` after layout fixes the classic blank-Leaflet-until-resize.
 *
 * Bridge: web posts `ready` / `map_press` / `marker_press` / `error`; RN pushes
 * state via injected `window.__apply(...)`. Re-centers only when `center` moves.
 */
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<style>${LEAFLET_CSS}</style>
<style>
  html,body{height:100%;margin:0;padding:0;}
  #map{position:absolute;top:0;right:0;bottom:0;left:0;background:#e8efe9;}
  .leaflet-container{background:#e8efe9;}
</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
  var RN = window.ReactNativeWebView;
  var map, markerLayer, routeLayer, tapMode = false, lastCenterKey = "";
  function post(o){ if (RN) RN.postMessage(JSON.stringify(o)); }
  function refresh(){ if (map) { try { map.invalidateSize(); } catch(e){} } }
  function pin(color){
    return L.divIcon({
      className: "",
      html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:'+color+';border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
      iconSize: [22,22], iconAnchor: [11,22]
    });
  }
  function init(){
    if (!window.L){ post({ type:"error", message:"Leaflet failed to initialize" }); return; }
    try {
      map = L.map("map", { zoomControl: true, attributionControl: false }).setView([20.5937,78.9629], 4);
      // Carto Voyager — CORS-friendly, subdomained, keyless. OSM's own tile
      // server is stricter and was blank in the Android WebView.
      var tiles = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png", {
        maxZoom: 19, subdomains: "abcd"
      });
      var firstErr = true, okPosted = false;
      tiles.on("tileerror", function(e){
        if (firstErr){ firstErr = false; post({ type:"tile_error", url: (e && e.tile && e.tile.src) || "" }); }
      });
      tiles.on("load", function(){ if (!okPosted){ okPosted = true; post({ type:"tiles_ok" }); } });
      tiles.addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      routeLayer = L.layerGroup().addTo(map);
      map.on("click", function(e){ if (tapMode) post({ type:"map_press", lat:e.latlng.lat, lng:e.latlng.lng }); });
      setTimeout(refresh, 0); setTimeout(refresh, 250); setTimeout(refresh, 800);
      window.addEventListener("resize", refresh);
      post({ type:"ready" });
    } catch (err){ post({ type:"error", message: "map init: " + String(err) }); }
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
      refresh();
    } catch (err){ post({ type:"error", message: String(err) }); }
  };
  init();
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
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(
    () => JSON.stringify({ center, zoom, markers, userLocation, route, tapToPlace }),
    [center, zoom, markers, userLocation, route, tapToPlace]
  );
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const push = () => ref.current?.injectJavaScript(`window.__apply(${payloadRef.current}); true;`);

  useEffect(() => {
    if (ready.current) push();
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
      setError(null);
      push();
    } else if (msg.type === "map_press") {
      onMapPress?.(msg.lat, msg.lng);
    } else if (msg.type === "marker_press") {
      onMarkerPress?.(msg.id);
    } else if (msg.type === "tiles_ok") {
      setError(null);
    } else if (msg.type === "tile_error") {
      setError(`tiles blocked${msg.url ? ` — ${String(msg.url).slice(0, 60)}` : ""}`);
    } else if (msg.type === "error") {
      setError(String(msg.message || "Map error"));
    }
  };

  return (
    <View className={className ?? "min-h-[240px] flex-1 overflow-hidden rounded-2xl bg-accent"}>
      {/* Behind the WebView until Leaflet paints over it. */}
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-[12px] text-muted-foreground">Loading map…</Text>
      </View>
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        // Match the tile origin so Android treats tile requests as same-origin
        // (a `localhost` baseUrl made Android block the tile downloads).
        source={{ html: HTML, baseUrl: "https://basemaps.cartocdn.com/" }}
        onMessage={onMessage}
        onLoadEnd={() => {
          if (ready.current) push();
        }}
        onError={(e) => setError(e.nativeEvent.description || "WebView error")}
        onHttpError={(e) => setError(`HTTP ${e.nativeEvent.statusCode}`)}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        nestedScrollEnabled
        androidLayerType="hardware"
        setBuiltInZoomControls={false}
        startInLoadingState={false}
        style={{ flex: 1, backgroundColor: "transparent" }}
      />
      {error ? (
        <View className="absolute bottom-2 left-2 right-2 rounded-xl bg-destructive/90 px-3 py-2">
          <Text className="text-[11px] font-medium text-white" numberOfLines={2}>
            Map: {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
