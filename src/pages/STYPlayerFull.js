import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Knob({ label, min = 0, max = 100, step = 1, value, onChange, caption }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const pct = (value - min) / (max - min);
  const angle = -135 + pct * 270;
  const startY = useRef(0);
  const startVal = useRef(value);
  const dragging = useRef(false);

  const setFromDelta = (dy) => {
    const range = max - min;
    const delta = -(dy / 100) * range;
    const raw = startVal.current + delta;
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped));
  };

  const onMouseDown = (e) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp, { once: true });
  };
  const onMouseMove = (e) => {
    if (!dragging.current) return;
    setFromDelta(e.clientY - startY.current);
  };
  const onMouseUp = () => {
    dragging.current = false;
    window.removeEventListener('mousemove', onMouseMove);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const direction = e.deltaY > 0 ? -1 : 1;
    onChange(clamp(value + direction * step));
  };

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        tabIndex={0}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        className="w-56 h-56 rounded-full bg-[#2b2b2b] shadow-inner border border-black/30 relative grid place-items-center cursor-grab active:cursor-grabbing"
      >
        <svg width="160" height="160" viewBox="0 0 84 84">
          <circle cx="42" cy="42" r="36" fill="#3d3d3d" stroke="#111" strokeWidth="2" />
          {[...Array(11)].map((_, i) => {
            const a = (-135 + (270 * i) / 10) * (Math.PI / 180);
            const x1 = 42 + Math.cos(a) * 28;
            const y1 = 42 + Math.sin(a) * 28;
            const x2 = 42 + Math.cos(a) * 34;
            const y2 = 42 + Math.sin(a) * 34;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#666" strokeWidth="2" />;
          })}
          <g transform={`rotate(${angle} 42 42)`}>
            <line x1="42" y1="42" x2="42" y2="10" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
            <circle cx="42" cy="42" r="8" fill="#0f0f0f" stroke="#f59e0b" />
          </g>
        </svg>
        <div className="absolute bottom-3 text-2xl text-gray-300 font-bold">{Math.round(value)}</div>
      </div>
      <div className="text-2xl font-extrabold tracking-wide">{label}</div>
      {caption && <div className="text-xl text-gray-400">{caption}</div>}
    </div>
  );
}

export default function STYPlayer() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [sectionsAvailability, setSectionsAvailability] = useState({});
  const [controls, setControls] = useState({ acmp: false, autofill: false, intro: '', main: 'A', ending: '', play: false });
  const [volume, setVolume] = useState(80);
  const [tempo, setTempo] = useState(120);
  const mainAudioRef = useRef(null);
  const oneShotAudioRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const v = Math.max(0, Math.min(1, volume / 100));
    if (mainAudioRef.current) mainAudioRef.current.volume = v;
    if (oneShotAudioRef.current) oneShotAudioRef.current.volume = v;
  }, [volume]);

  useEffect(() => {
    const rate = Math.max(0.25, Math.min(4, tempo / 120));
    if (mainAudioRef.current) mainAudioRef.current.playbackRate = rate;
    if (oneShotAudioRef.current) oneShotAudioRef.current.playbackRate = rate;
  }, [tempo]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth');
      return;
    }
    axios.get('/api/beats', { headers: { Authorization: `Bearer ${token}` } }).then((res) => setBeats(res.data.beats));
  }, [navigate]);

  const renderBeatCard = (beat) => (
    <div key={beat.id} className="flex items-center gap-6 cursor-pointer p-6 mb-6 rounded-lg bg-[#3a3a3a] hover:bg-blue-700 text-2xl">
      <p className="font-bold">{beat.title}</p>
    </div>
  );

  const currentPageBeats = beats.slice(0, 10);
  const leftColumn = currentPageBeats.slice(0, 5);
  const rightColumn = currentPageBeats.slice(5);

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-12 select-none">
      <audio ref={mainAudioRef} hidden />
      <audio ref={oneShotAudioRef} hidden />
      <h1 className="text-6xl font-extrabold text-center mb-12">🎧 PSR MANAGER STYLE</h1>

      <div className="max-w-[90rem] mx-auto flex flex-col md:flex-row items-stretch gap-12 mb-12">
        <div className="md:w-[260px] w-full bg-[#2a2a2a] rounded-2xl p-8 grid place-items-center">
          <Knob label="VOLUME" value={volume} onChange={setVolume} caption={`${volume}%`} />
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-[#2a2a2a] p-8 rounded-2xl shadow-inner text-3xl">
            {leftColumn.length === 0 ? <p className="text-gray-400 text-center">Aucun beat disponible</p> : leftColumn.map(renderBeatCard)}
          </div>
          <div className="bg-[#2a2a2a] p-8 rounded-2xl shadow-inner text-3xl">
            {rightColumn.length === 0 ? <p className="text-gray-400 text-center">Rien à afficher</p> : rightColumn.map(renderBeatCard)}
          </div>
        </div>

        <div className="md:w-[260px] w-full bg-[#2a2a2a] rounded-2xl p-8 grid place-items-center">
          <Knob label="TEMPO" min={40} max={240} value={tempo} onChange={setTempo} caption={`${tempo} BPM`} />
        </div>
      </div>
    </div>
  );
}
