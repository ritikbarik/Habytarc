import React from 'react';

const HOURS_12 = Array.from({ length: 12 }, (_, idx) => String(idx + 1).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0'));
const MERIDIEM = ['AM', 'PM'];

function splitTime(value) {
  const raw = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return { hour: '', minute: '' };
  const [hour, minute] = raw.split(':');
  return { hour, minute };
}

function to12Hour(hour24) {
  const hour = Number(hour24);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return { hour12: '', ampm: '' };
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 || 12;
  return { hour12: String(normalized).padStart(2, '0'), ampm };
}

function to24Hour(hour12, ampm) {
  const hour = Number(hour12);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return '';
  if (ampm !== 'AM' && ampm !== 'PM') return '';
  if (ampm === 'AM') {
    return String(hour === 12 ? 0 : hour).padStart(2, '0');
  }
  return String(hour === 12 ? 12 : hour + 12).padStart(2, '0');
}

function TimeWheelPicker({
  value = '',
  onChange,
  disabled = false,
  className = '',
  allowEmpty = true
}) {
  const parsed = splitTime(value);
  const converted = parsed.hour ? to12Hour(parsed.hour) : { hour12: '', ampm: '' };
  const hour = converted.hour12;
  const minute = parsed.minute;
  const ampm = converted.ampm;

  const emit = (nextHour12, nextMinute, nextAmPm) => {
    if (!nextHour12 || !nextMinute || !nextAmPm) {
      onChange?.('');
      return;
    }
    const hour24 = to24Hour(nextHour12, nextAmPm);
    if (!hour24) {
      onChange?.('');
      return;
    }
    onChange?.(`${hour24}:${nextMinute}`);
  };

  return (
    <div className={`time-wheel ${className}`.trim()}>
      <select
        value={hour}
        onChange={(e) => {
          const nextHour = e.target.value;
          if (!nextHour && allowEmpty) {
            emit('', '');
            return;
          }
          emit(nextHour, minute || '00', ampm || 'AM');
        }}
        disabled={disabled}
        className="time-wheel-select"
      >
        {allowEmpty && <option value="">HH</option>}
        {HOURS_12.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <span className="time-wheel-sep">:</span>
      <select
        value={minute}
        onChange={(e) => {
          const nextMinute = e.target.value;
          if (!nextMinute && allowEmpty) {
            emit('', '');
            return;
          }
          emit(hour || '12', nextMinute, ampm || 'AM');
        }}
        disabled={disabled}
        className="time-wheel-select"
      >
        {allowEmpty && <option value="">MM</option>}
        {MINUTES.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      <select
        value={ampm}
        onChange={(e) => {
          const nextAmPm = e.target.value;
          if (!nextAmPm && allowEmpty) {
            emit('', '');
            return;
          }
          emit(hour || '12', minute || '00', nextAmPm);
        }}
        disabled={disabled}
        className="time-wheel-select"
      >
        {allowEmpty && <option value="">AM/PM</option>}
        {MERIDIEM.map((item) => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
    </div>
  );
}

export default TimeWheelPicker;
