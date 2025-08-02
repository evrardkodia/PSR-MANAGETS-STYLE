// STYPlayerSM.js
// Version mobile de STYPlayer
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';

export default function STYPlayerSM() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [controls, setControls] = useState({
    acmp: false,
    autofill: false,
    intro: '',
    main: 'A',
    ending: '',
    play: false,
    disabledChannels: [11, 12, 13, 14, 15, 16],
  });
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/auth');

    axios
      .get(`${BACKEND_URL}/api/beats/public`)
      .then((res) => {
        const sorted = res.data.beats.sort((a, b) => a.title.localeCompare(b.title));
        setBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  const getIconPath = (title) => {
    const iconCount = 10;
    let sum = 0;
    for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
    const index = (sum % iconCount) + 1;
    return `/icons/${index}.png`;
  };

  const togglePlay = async () => {
    if (!selectedBeat || isLoading) {
      alert('⚠️ Aucun beat sélectionné ou en cours de chargement.');
      return;
    }

    const token = localStorage.getItem('token');
    let section = `Main ${controls.main}`;
    if (controls.intro) section = `Intro ${controls.intro}`;
    else if (controls.ending) section = `Ending ${controls.ending}`;

    if (controls.play && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();

      try {
        await axios.post(
          `${BACKEND_URL}/api/player/cleanup`,
          { beatId: selectedBeat.id, section },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (err) {
        console.warn('⚠️ Cleanup fail:', err.message || err);
      }

      setControls((prev) => ({ ...prev, play: false }));
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/player/play-section`,
        {
          beatId: selectedBeat.id,
          section,
          acmpEnabled: controls.acmp,
          disabledChannels: controls.disabledChannels,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        audioRef.current.loop = true;
        await audioRef.current.play();
      }

      setControls((prev) => ({ ...prev, play: true }));
    } catch (err) {
      console.error('❌ Lecture échouée :', err.message || err);
      alert('❌ Impossible de lire ce beat.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderControl = (label, type, value = null, active = false) => (
    <button
      className={`py-2 px-3 rounded-md text-xs font-bold mx-1 my-1 ${
        active ? 'bg-orange-500 text-black' : 'bg-gray-700 text-white'
      }`}
      onClick={() => {
        if (type === 'play') {
          togglePlay();
          return;
        }

        setControls((prev) => {
          const updated = { ...prev };
          if (type === 'acmp' || type === 'autofill') {
            updated[type] = !prev[type];
          } else if (type === 'intro') {
            updated.intro = prev.intro === value ? '' : value;
            updated.ending = '';
          } else if (type === 'ending') {
            updated.ending = prev.ending === value ? '' : value;
            updated.intro = '';
          } else if (type === 'main') {
            updated.main = value;
          }
          return updated;
        });
      }}
      key={`${type}-${value || 'none'}`}
      disabled={isLoading && type === 'play'}
    >
      {isLoading && type === 'play' ? '⏳ Chargement...' : label}
    </button>
  );

  const handleSelectBeat = (beat) => {
    if (!beat.filename) {
      alert("⚠️ Ce beat n'a pas de fichier .sty associé.");
      return;
    }
    setSelectedBeat(beat);
    setControls({
      acmp: false,
      autofill: false,
      intro: '',
      main: 'A',
      ending: '',
      play: false,
      disabledChannels: [11, 12, 13, 14, 15, 16],
    });

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-white p-4 flex flex-col">
      <h1 className="text-2xl font-bold mb-4 text-center">🎧 PSR MANAGER STYLE - Mobile</h1>

      <div className="flex-grow overflow-auto mb-4">
        {beats.length === 0 ? (
          <p className="text-center text-gray-400">Aucun beat disponible</p>
        ) : (
          beats.map((beat) => (
            <div
              key={beat.id}
              onClick={() => handleSelectBeat(beat)}
              className={`p-2 mb-2 rounded-md cursor-pointer flex items-center gap-3 ${
                selectedBeat?.id === beat.id ? 'bg-blue-800' : 'bg-[#3a3a3a]'
              }`}
            >
              <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm">
                <img src={getIconPath(beat.title)} alt="icon" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <p className="font-semibold">{beat.title}</p>
                <p className="text-xs text-gray-400 italic">
                  {beat.signature} - {beat.tempo} BPM
                </p>
                <p className="text-xs text-gray-400 italic">Par : {beat.user?.username || 'inconnu'}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedBeat && (
        <div className="bg-[#2a2a2a] rounded-md p-4">
          <h2 className="text-lg font-semibold mb-2">{selectedBeat.title}</h2>
          <p className="text-gray-400 mb-2">Tempo : {selectedBeat.tempo} BPM</p>
          <p className="text-gray-400 mb-2">Signature : {selectedBeat.signature}</p>
          <p className="text-gray-400 mb-4">Description : {selectedBeat.description || 'Aucune'}</p>

          <div className="flex flex-wrap justify-center">
            {renderControl('ACMP', 'acmp', null, controls.acmp)}
            {renderControl('AUTO-FILL', 'autofill', null, controls.autofill)}
            {['A', 'B', 'C', 'D'].map((i) => renderControl(`INTRO ${i}`, 'intro', i, controls.intro === i))}
            {['A', 'B', 'C', 'D'].map((m) => renderControl(m, 'main', m, controls.main === m))}
            {['A', 'B', 'C', 'D'].map((i) => renderControl(`END ${i}`, 'ending', i, controls.ending === i))}

            {renderControl(controls.play ? '⏹ STOP' : '▶️ PLAY', 'play', null, controls.play)}
          </div>
        </div>
      )}

      <audio ref={audioRef} hidden />
    </div>
  );
}
