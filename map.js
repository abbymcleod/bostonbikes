import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoiYWJieW1jbGVvZCIsImEiOiJjbXA3b2Z4M3owOW9wMnBwdnNmbjdkdjd0In0.PyN5jWfi1IqxwIVHPy-frQ';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],  // Boston, [lng, lat]
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
  });