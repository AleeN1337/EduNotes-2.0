"use client";

import React, { useState, useEffect, useRef } from "react";
import { Box, Card, CardContent, Typography } from "@mui/material";
import api from "@/lib/api";

export default function QuickStatsCards() {
  const [notesCount, setNotesCount] = useState<number | null>(null);
  const [orgCount, setOrgCount] = useState<number | null>(null);
  const [rank, setRank] = useState<string | null>(null);
  // Initialize session start time and persist across refreshes
  const sessionStart = useRef<number>(
    (() => {
      const stored = localStorage.getItem("session_start");
      if (stored) return parseInt(stored, 10);
      const now = Date.now();
      localStorage.setItem("session_start", now.toString());
      return now;
    })()
  );
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const fetchStats = async () => {
    try {
      // Pobierz dane notatek i organizacji z obsługą błędów 404
      const promises = [
        api.get("/notes/my").catch((err) => {
          if (err.response?.status === 404) {
            console.log(
              "Notes endpoint not available yet - using default values"
            );
            return { data: { data: [] } };
          }
          throw err;
        }),
        api.get("/organizations/my").catch((err) => {
          if (err.response?.status === 404) {
            console.log(
              "Organizations endpoint not available yet - using default values"
            );
            return { data: { data: [] } };
          }
          throw err;
        }),
      ];

      const [notesRes, orgRes] = await Promise.all(promises);

      const notesArray = Array.isArray(notesRes.data?.data)
        ? notesRes.data.data
        : [];
      const orgArray = Array.isArray(orgRes.data?.data) ? orgRes.data.data : [];

      // Obliczanie rangi na podstawie liczby notatek
      const count = notesArray.length;
      let computedRank: string;
      if (count >= 40) computedRank = "mistrz";
      else if (count >= 30) computedRank = "ekspert";
      else if (count >= 20) computedRank = "specalista";
      else if (count >= 10) computedRank = "początkujący";
      else computedRank = "niekompetentny";

      setNotesCount(count);
      setOrgCount(orgArray.length);
      setRank(computedRank);
    } catch (error) {
      console.error("QuickStatsCards: Error fetching overview data", error);
      // Ustaw domyślne wartości w przypadku błędu
      setNotesCount(0);
      setOrgCount(0);
      setRank("początkujący");
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  // Timer for session duration
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStart.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        📊 Szybki przegląd
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(4, 1fr)",
          },
          gap: 3,
        }}
      >
        <Card sx={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)", borderRadius: 2 }}>
          <CardContent sx={{ textAlign: "center", py: 3 }}>
            <Typography variant="h3" color="primary" sx={{ fontWeight: 700 }}>
              {notesCount !== null ? notesCount : "--"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Moje notatki
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)", borderRadius: 2 }}>
          <CardContent sx={{ textAlign: "center", py: 3 }}>
            <Typography variant="h3" color="secondary" sx={{ fontWeight: 700 }}>
              {orgCount !== null ? orgCount : "--"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Moje Organizacje
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)", borderRadius: 2 }}>
          <CardContent sx={{ textAlign: "center", py: 3 }}>
            <Typography
              variant="h3"
              color="warning.main"
              sx={{ fontWeight: 700 }}
            >
              {`${String(Math.floor(elapsedSeconds / 3600)).padStart(
                2,
                "0"
              )}:` +
                `${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(
                  2,
                  "0"
                )}:` +
                `${String(elapsedSeconds % 60).padStart(2, "0")}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Czas spędzony
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ boxShadow: "0 4px 20px rgba(0,0,0,0.1)", borderRadius: 2 }}>
          <CardContent sx={{ textAlign: "center", py: 3 }}>
            <Typography
              color="success.main"
              sx={{
                fontWeight: 700,
                // Responsive font size so long words don’t break layout
                fontSize: { xs: "1.5rem", sm: "2rem", md: "2.25rem" },
                lineHeight: 1.2,
                // Allow breaking long single words like "niekompetentny"
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                whiteSpace: "normal",
                display: "inline-block",
                maxWidth: "100%",
              }}
            >
              {rank !== null ? rank : "--"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Nasza ranga
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
