import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from './config';

export default function STYPlayerFull() {
  const [beats, setBeats] = useState([]);
  const [selectedBeat, setSelectedBeat] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const navigate = useNavigate();
  const ITEMS_PER_PAGE = 20;
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchBeats = async () => {
      try {
        const response = await axios.get(`${BACKEND_URL}/beats?page=${page}&limit=${ITEMS_PER_PAGE}`);
        setBeats(response.data);
      } catch (error) {
        console.error('Error fetching beats:', error);
      }
    };

    fetchBeats();
  }, [page]);

  const handleBeatClick = (beat) => {
    setSelectedBeat(beat);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <h1 className="text-4xl font-extrabold mb-4 select-none drop-shadow-lg">STY Player</h1>

      <div className="flex gap-1 mb-6 bg-[#111] px-3 py-2 rounded-md shadow-inner border border-gray-700">
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="w-6 h-10 bg-gradient-to-b from-blue-500 to-gray-700 border border-gray-600 rounded-sm"
          />
        ))}
        <div
          className="w-6 h-10 bg-gradient-to-b from-blue-500 to-gray-700 border border-gray-600 rounded-sm relative"
          title="Play"
        >
          <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">▶</span>
        </div>
      </div>

      {selectedBeat && (
        <div className="p-4 border border-gray-700 rounded-lg bg-gray-900 mb-4">
          <h2 className="text-xl font-bold mb-2">{selectedBeat.name}</h2>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <button className="bg-blue-800 py-2 rounded">ACMP</button>
            <button className="bg-gray-700 py-2 rounded">INTRO A</button>
            <button className="bg-gray-700 py-2 rounded">INTRO B</button>
            <button className="bg-gray-700 py-2 rounded">INTRO C</button>
            <button className="bg-gray-700 py-2 rounded">INTRO D</button>
            <button className="bg-green-800 py-2 rounded">MAIN A</button>
            <button className="bg-green-800 py-2 rounded">MAIN B</button>
            <button className="bg-green-800 py-2 rounded">MAIN C</button>
            <button className="bg-green-800 py-2 rounded">MAIN D</button>
            <button className="bg-red-800 py-2 rounded">ENDING A</button>
            <button className="bg-red-800 py-2 rounded">ENDING B</button>
            <button className="bg-red-800 py-2 rounded">ENDING C</button>
            <button className="bg-red-800 py-2 rounded">ENDING D</button>
            <button
              className="col-span-4 bg-yellow-500 py-3 rounded text-black font-bold mt-2"
              onClick={togglePlay}
            >
              {isPlaying ? 'PAUSE' : 'PLAY'}
            </button>
          </div>

          <audio ref={audioRef} src={selectedBeat.audioUrl} preload="auto" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {beats.map((beat) => (
          <div
            key={beat._id}
            className="beat-container"
            onClick={() => handleBeatClick(beat)}
          >
            <div className="icon-container">
              <img src="/icons/wav.png" alt="icon" />
            </div>
            <div>
              <div className="beat-text">{beat.name}</div>
              <div className="beat-subtext">{beat.genre}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
