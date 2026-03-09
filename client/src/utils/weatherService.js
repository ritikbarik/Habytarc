const WEATHER_TEXT = {
  0: 'Clear sky',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Heavy thunderstorm with hail'
};

const WEATHER_ALERT_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);

const getPosition = () =>
  new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
  });

export const getWeatherLabel = (code) => WEATHER_TEXT[Number(code)] || 'Unknown weather';

export const isSevereWeatherCode = (code) => WEATHER_ALERT_CODES.has(Number(code));

export const fetchWeatherSnapshot = async () => {
  const position = await getPosition();
  const latitude = Number(position.coords.latitude);
  const longitude = Number(position.coords.longitude);

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weather_code,is_day,precipitation,wind_speed_10m&timezone=auto`;
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en&count=1&format=json`;

  const [weatherRes, geoRes] = await Promise.all([fetch(weatherUrl), fetch(geoUrl)]);
  if (!weatherRes.ok) {
    throw new Error('Weather API request failed');
  }

  const weatherJson = await weatherRes.json();
  const geoJson = geoRes.ok ? await geoRes.json() : { results: [] };
  const current = weatherJson?.current || {};
  const city = geoJson?.results?.[0]?.name || 'Your area';
  const country = geoJson?.results?.[0]?.country || '';
  const weatherCode = Number(current.weather_code ?? -1);

  return {
    cityLabel: country ? `${city}, ${country}` : city,
    timezone: String(weatherJson?.timezone || ''),
    currentTimeIso: String(current.time || ''),
    temperatureC: Number(current.temperature_2m ?? NaN),
    apparentTemperatureC: Number(current.apparent_temperature ?? NaN),
    precipitationMm: Number(current.precipitation ?? NaN),
    windSpeedKmh: Number(current.wind_speed_10m ?? NaN),
    weatherCode,
    weatherLabel: getWeatherLabel(weatherCode),
    isDay: Number(current.is_day || 0) === 1
  };
};
