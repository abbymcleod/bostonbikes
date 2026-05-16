import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

console.log('Mapbox GL JS Loaded:', mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoiYWJieW1jbGVvZCIsImEiOiJjbXA3b2Z4M3owOW9wMnBwdnNmbjdkdjd0In0.PyN5jWfi1IqxwIVHPy-frQ';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
  });
  
  const bikeLanePaint = {
    'line-color': '#32D400',
    'line-width': 5,
    'line-opacity': 0.6,
  };
  
  const svg = d3.select('#map').select('svg');
  
  // --- Performance buckets (1440 minutes in a day) ---
  let departuresByMinute = Array.from({ length: 1440 }, () => []);
  let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
  
  // --- Global helper functions ---
  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }
  
  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }
  
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  
  function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) {
      return tripsByMinute.flat();
    }
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;
  
    if (minMinute > maxMinute) {
      let beforeMidnight = tripsByMinute.slice(minMinute);
      let afterMidnight = tripsByMinute.slice(0, maxMinute);
      return beforeMidnight.concat(afterMidnight).flat();
    } else {
      return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
  }
  
  function computeStationTraffic(stations, timeFilter = -1) {
    const departures = d3.rollup(
      filterByMinute(departuresByMinute, timeFilter),
      (v) => v.length,
      (d) => d.start_station_id,
    );
  
    const arrivals = d3.rollup(
      filterByMinute(arrivalsByMinute, timeFilter),
      (v) => v.length,
      (d) => d.end_station_id,
    );
  
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });
  }
  
  map.on('load', async () => {
    // --- Bike lanes ---
    map.addSource('boston_route', {
      type: 'geojson',
      data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
    });
    map.addLayer({
      id: 'boston-bike-lanes',
      type: 'line',
      source: 'boston_route',
      paint: bikeLanePaint,
    });
  
    map.addSource('cambridge_route', {
      type: 'geojson',
      data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
    });
    map.addLayer({
      id: 'cambridge-bike-lanes',
      type: 'line',
      source: 'cambridge_route',
      paint: bikeLanePaint,
    });
  
    // --- Load stations ---
    let jsonData;
    try {
      jsonData = await d3.json('bluebikes-stations.json');
      console.log('Loaded JSON Data:', jsonData);
    } catch (error) {
      console.error('Error loading JSON:', error);
      return;
    }
  
    // --- Load traffic data and populate minute buckets ---
    try {
      await d3.csv(
        'bluebikes-traffic-2024-03.csv',
        (trip) => {
          trip.started_at = new Date(trip.started_at);
          trip.ended_at = new Date(trip.ended_at);
  
          const startMinute = minutesSinceMidnight(trip.started_at);
          const endMinute = minutesSinceMidnight(trip.ended_at);
  
          departuresByMinute[startMinute].push(trip);
          arrivalsByMinute[endMinute].push(trip);
  
          return trip;
        },
      );
      console.log('Trips loaded into minute buckets');
    } catch (error) {
      console.error('Error loading traffic CSV:', error);
      return;
    }
  
    // --- Compute initial station traffic ---
    let stations = computeStationTraffic(jsonData.data.stations);
    console.log('Stations with traffic:', stations[0]);
  
    // --- Radius scale ---
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);
  
    // --- Draw circles ---
    const circles = svg
      .selectAll('circle')
      .data(stations, (d) => d.short_name)
      .enter()
      .append('circle')
      .attr('fill', 'steelblue')
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .each(function (d) {
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
      });
  
    // --- Position update ---
    function updatePositions() {
      circles
        .attr('cx', (d) => getCoords(d).cx)
        .attr('cy', (d) => getCoords(d).cy)
        .attr('r', (d) => radiusScale(d.totalTraffic));
    }
  
    updatePositions();
    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);
  
    // --- Scatter plot update ---
    function updateScatterPlot(timeFilter) {
      const filteredStations = computeStationTraffic(stations, timeFilter);
      timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
      circles
        .data(filteredStations, (d) => d.short_name)
        .join('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic));
    }
  
    // --- Slider ---
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');
  
    function updateTimeDisplay() {
      let timeFilter = Number(timeSlider.value);
  
      if (timeFilter === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
      } else {
        selectedTime.textContent = formatTime(timeFilter);
        anyTimeLabel.style.display = 'none';
      }
  
      updateScatterPlot(timeFilter);
    }
  
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
  });