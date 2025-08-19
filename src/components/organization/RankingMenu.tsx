"use client";
import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  IconButton,
  Menu,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Box,
  Typography,
  CircularProgress,
  Chip,
  Tooltip,
  Divider,
} from "@mui/material";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";

export interface RankingMember {
  user_id: string;
  email?: string;
  username?: string;
  role?: string;
}

interface RankingMenuProps {
  members: RankingMember[];
  orgId?: string | number;
}

export default function RankingMenu({ members, orgId }: RankingMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [loading, setLoading] = useState(false);
  const [userLikes, setUserLikes] = useState<Record<string, number>>({});

  const handleOpen = (e: React.MouseEvent<HTMLElement>) =>
    setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    const fetchLikes = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/notes/`, { validateStatus: () => true });
        const listData = Array.isArray(res?.data?.data)
          ? res.data.data
          : Array.isArray(res?.data)
          ? res.data
          : [];

        const counts: Record<string, number> = {};
        for (const note of listData) {
          const nidOrg =
            note.organization_id ?? note.org_id ?? note.organization;
          if (orgId && String(nidOrg) !== String(orgId)) continue;
          const uid = String(note.user_id ?? note.userId ?? note.user ?? "");
          const likes = Number(note.likes ?? 0) || 0;
          if (!uid) continue;
          counts[uid] = (counts[uid] || 0) + likes;
        }
        // ensure all members present
        for (const m of members) {
          if (!counts[m.user_id]) counts[m.user_id] = 0;
        }
        if (mounted) setUserLikes(counts);
      } catch (e) {
        console.warn("RankingMenu: failed to fetch notes for likes", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void fetchLikes();
    return () => {
      mounted = false;
    };
  }, [open, members, orgId]);

  const getInitials = (m: RankingMember) => {
    if (m.email) return m.email.substring(0, 2).toUpperCase();
    if (m.username) return m.username.substring(0, 2).toUpperCase();
    return String(m.user_id).substring(0, 2).toUpperCase();
  };

  const medalFor = (rank: number) => {
    if (rank === 1) return { color: "#D4AF37", label: "Złoto" }; // gold
    if (rank === 2) return { color: "#C0C0C0", label: "Srebro" }; // silver
    if (rank === 3) return { color: "#CD7F32", label: "Brąz" }; // bronze
    return null;
  };

  const displayName = (m: RankingMember) => {
    if (m.username) return `@${m.username}`;
    if (m.email) return m.email;
    return `Użytkownik #${m.user_id}`;
  };

  const ranked = [...members].map((m) => ({
    ...m,
    likes: userLikes[m.user_id] ?? 0,
  }));

  ranked.sort((a, b) => {
  // Sortuj wyłącznie po polubieniach (malejąco). Rola nie wpływa na pozycję.
  if (b.likes !== a.likes) return b.likes - a.likes;
    const an = (a.username || a.email || "").toLowerCase();
    const bn = (b.username || b.email || "").toLowerCase();
    return an.localeCompare(bn);
  });

  return (
    <>
      <Tooltip title="Ranking użytkowników">
        <IconButton color="inherit" size="small" onClick={handleOpen}>
          <LeaderboardIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { width: 360, maxWidth: "90vw" } } }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            Ranking użytkowników
          </Typography>
        </Box>
        <Divider />
        {loading && (
          <List>
            <ListItem>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <CircularProgress size={20} />
                <Typography>Ładowanie rankingu...</Typography>
              </Box>
            </ListItem>
          </List>
        )}
        {!loading && (
          <List dense>
            {ranked.map((m, idx) => {
              const rank = idx + 1;
              const medal = medalFor(rank);
              return (
                <ListItem key={m.user_id} sx={{ gap: 1 }}>
                  <ListItemAvatar>
                    {medal ? (
                      <Avatar
                        sx={{
                          width: 36,
                          height: 36,
                          bgcolor: medal.color,
                          color: "black",
                        }}
                      >
                        <EmojiEventsIcon />
                      </Avatar>
                    ) : (
                      <Avatar sx={{ width: 36, height: 36 }}>
                        {getInitials(m)}
                      </Avatar>
                    )}
                  </ListItemAvatar>
                  <ListItemText
                    primary={displayName(m)}
                    secondary={m.role === "owner" ? "Właściciel" : undefined}
                  />
                  <Box
                    sx={{
                      ml: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <Chip
                      size="small"
                      label={`#${rank}`}
                      sx={{ fontSize: "0.75rem" }}
                    />
                    <Chip
                      icon={<LeaderboardIcon />}
                      size="small"
                      label={m.likes}
                      sx={medal ? { borderColor: medal.color } : undefined}
                    />
                  </Box>
                </ListItem>
              );
            })}
          </List>
        )}
      </Menu>
    </>
  );
}
