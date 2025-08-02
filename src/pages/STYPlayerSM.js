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
      className={`py-2 px-3 rounded-md text-xs font-bold ${
        active ? 'bg-orange-500 text-black' : 'bg-gray-700 text-white'
      }`}
      onClick={() => {
        if (type === 'play') togglePlay();
        else {
          setControls((prev) => {
            const updated = { ...prev };
            if (type === 'acmp' || type === 'autofill') {
              updated[typ]()
