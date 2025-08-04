import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';

const ledsStyle = {
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: 'orange',
  margin: '0 auto 6px auto',
};

const buttonStyle = {
  backgroundColor: '#333',
  color: 'white',
  border: 'none',
  padding: '8px 12px',
  margin: '0 6px',
  borderRadius: '4px',
  cursor: 'pointer',
  minWidth: '70px',
  userSelect: 'none',
  whiteSpace: 'nowrap',
};

export default function STYPlayerFull() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 10;
  const [page, setPage] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return navigate('/auth');
    axios
      .get(`${BACKEND_URL}/api/beats/public`)
      .then((res) => {
        const sorted = res.data.beats
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((beat) => ({
            ...beat,
            icon: `/icons/${Math.floor(Math.random() * 10 + 1)}.png`,
          }));
        setBeats(sorted);
      })
      .catch(() => navigate('/auth'));
  }, [navigate]);

  const handleSelectBeat = (beat) => {
    if (isPlaying) {
      stopPlayback();
    }
    setSelectedBeat(beat);
  };

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }
    setIsPlaying(false);
    setIsLoading(false);
  };

  const togglePlay = async () => {
    if (!selectedBeat) {
      alert('⚠️ Veuillez sélectionner un beat avant de jouer.');
      return;
    }
    if (isPlaying) {
      stopPlayback();
      return;
    }

    setIsLoading(true);
    const token = localStorage.getItem('token');

    try {
      const response = await axios.post(
        `${BACKEND_URL}/api/player/play-full`,
        { beatId: selectedBeat.id },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.loop = true;
        await audioRef.current.play();
      }
      setIsPlaying(true);
    } catch (error) {
      console.error('❌ Erreur lecture:', error);
      alert('Erreur lors de la lecture du beat. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  };

  const pagedBeats = beats.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
  const leftColumn = pagedBeats.slice(0, 5);
  const rightColumn = pagedBeats.slice(5, 10);

  return (
    <div
      style={{
        padding: '20px',
        color: '#eee',
        fontFamily: 'Arial, sans-serif',
        backgroundColor: '#1e1e1e',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ marginBottom: 16 }}>Liste des Beats</h2>

      <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginBottom: 30 }}>
        {/* Colonne gauche */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: '1 1 0', maxWidth: 300 }}>
          {leftColumn.map((beat) => (
            <li key={beat.id} style={{ marginBottom: 8 }}>
              <button
                style={{
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: selectedBeat?.id === beat.id ? '#555' : '#444',
                  border: 'none',
                  padding: '10px 15px',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
                onClick={() => handleSelectBeat(beat)}
              >
                <img src={beat.icon} alt="icon" style={{ width: 30, height: 30, borderRadius: 6 }} />
                {beat.title}
              </button>
            </li>
          ))}
        </ul>

        {/* Colonne droite */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: '1 1 0', maxWidth: 300 }}>
          {rightColumn.map((beat) => (
            <li key={beat.id} style={{ marginBottom: 8 }}>
              <button
                style={{
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: selectedBeat?.id === beat.id ? '#555' : '#444',
                  border: 'none',
                  padding: '10px 15px',
                  borderRadius: 6,
                  color: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
                onClick={() => handleSelectBeat(beat)}
              >
                <img src={beat.icon} alt="icon" style={{ width: 30, height: 30, borderRadius: 6 }} />
                {beat.title}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Lecteur */}
      {selectedBeat && (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#222',
            borderRadius: '10px',
            color: 'white',
            boxShadow: '0 0 10px #f60',
            display: 'flex',
            justifyContent: 'center',
            gap: '12px',
            overflowX: 'auto',
          }}
        >
          <div style={{ textAlign: 'center', margin: '0 6px', flex: '0 0 auto' }}>
            <div style={ledsStyle}></div>
            <button style={buttonStyle}>ACMP</button>
          </div>

          {['INTRO A', 'INTRO B', 'INTRO C', 'INTRO D'].map((name) => (
            <div key={name} style={{ textAlign: 'center', margin: '0 6px', flex: '0 0 auto' }}>
              <div style={ledsStyle}></div>
              <button style={buttonStyle}>{name}</button>
            </div>
          ))}

          {['MAIN A', 'MAIN B', 'MAIN C', 'MAIN D'].map((name) => (
            <div key={name} style={{ textAlign: 'center', margin: '0 6px', flex: '0 0 auto' }}>
              <div style={ledsStyle}></div>
              <button style={buttonStyle}>{name}</button>
            </div>
          ))}

          {['ENDING A', 'ENDING B', 'ENDING C', 'ENDING D'].map((name) => (
            <div key={name} style={{ textAlign: 'center', margin: '0 6px', flex: '0 0 auto' }}>
              <div style={ledsStyle}></div>
              <button style={buttonStyle}>{name}</button>
            </div>
          ))}

          {/* Bouton Play */}
          <div style={{ textAlign: 'center', margin: '0 6px', flex: '0 0 auto' }}>
            <div style={ledsStyle}></div>
            <button
              onClick={togglePlay}
              style={{ ...buttonStyle, minWidth: '100px', backgroundColor: isPlaying ? '#fa3' : '#f60' }}
              disabled={isLoading}
            >
              {isLoading ? 'Chargement...' : isPlaying ? 'STOP' : 'PLAY'}
            </button>
          </div>

          {/* Bouton fermer */}
          <div style={{ textAlign: 'center', margin: '0 6px', flex: '0 0 auto' }}>
            <div style={{ width: '12px', height: '12px', marginBottom: '6px' }}></div>
            <button
              onClick={() => {
                stopPlayback();
                setSelectedBeat(null);
              }}
              style={{ ...buttonStyle, backgroundColor: '#900', minWidth: 120 }}
            >
              FERMER
            </button>
          </div>

          <audio ref={audioRef} />
        </div>
      )}

      {/* Pagination */}
      <div style={{ marginTop: 30, textAlign: 'center' }}>
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{ marginRight: 10, padding: '6px 12px', cursor: 'pointer' }}
        >
          Précédent
        </button>
        <button
          onClick={() => setPage((p) => (p + 1) * ITEMS_PER_PAGE < beats.length ? p + 1 : p)}
          disabled={(page + 1) * ITEMS_PER_PAGE >= beats.length}
          style={{ padding: '6px 12px', cursor: 'pointer' }}
        >
          Suivant
        </button>
      </div>
    </div>
  );
}
