"use client";
import React, { useState } from "react";
import api from "@/lib/api";
import {
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Typography,
  Box,
  Avatar,
  Chip,
  Tooltip,
  Divider,
  CircularProgress,
} from "@mui/material";
import {
  Group as GroupIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ThumbUp as ThumbUpIcon,
} from "@mui/icons-material";

export interface OrganizationMember {
  user_id: string;
  email?: string;
  username?: string;
  role?: string;
}

interface UserManagementMenuProps {
  members: OrganizationMember[];
  currentUserId?: string | null;
  isOwner: boolean;
  onRemoveMember: (userId: string, email?: string | null) => void;
  onRefreshMembers: () => void;
  loading?: boolean;
  userEmails?: Record<string, string>;
  onEmailResolved?: (userId: string, email: string) => void;
  orgId?: string | number;
}

export default function UserManagementMenu({
  members,
  currentUserId,
  isOwner,
  onRemoveMember,
  onRefreshMembers,
  loading = false,
  userEmails = {},
  onEmailResolved,
  orgId,
}: UserManagementMenuProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const [likesLoading, setLikesLoading] = useState(false);
  const [userLikes, setUserLikes] = useState<Record<string, number>>({});

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleRemove = async (userId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    // Try to pass known email to the parent so the confirm dialog can show it
    const member = members.find((m) => m.user_id === userId);
    let emailFromCache = userEmails[userId] as string | undefined;

    // If cache contains empty string explicitly, treat as missing
    if (emailFromCache === "") emailFromCache = undefined;

    // Prefer explicit email, then cached email. Keep username as a stable fallback but set it
    // only after attempting backend fetches so we still try to retrieve a real email first.
    let email = member?.email || emailFromCache || null;

    // Best-effort: if we don't have an email yet, try to fetch it from backend
    if (!email && member) {
      try {
        const res = await api.get(`/users/${member.user_id}`, {
          validateStatus: () => true,
        });
        if (res?.status === 200 && res.data) {
          const u = res.data?.data ?? res.data;
          const foundEmail =
            u?.email ||
            u?.user_email ||
            u?.email_address ||
            (u?.profile && (u.profile.email || u.profile.user_email));
          if (foundEmail) {
            email = String(foundEmail);
          }
        } else {
          // Log non-200 diagnostic info and try fallback list endpoints
          console.warn(
            `User fetch /users/${member.user_id} returned status ${res?.status}`,
            res?.data
          );

          const listCandidates = [
            `/users/?user_id=${member.user_id}`,
            `/users/?id=${member.user_id}`,
            `/users/?userId=${member.user_id}`,
            `/users/`,
          ];
          for (const candidate of listCandidates) {
            try {
              const lr = await api.get(candidate, {
                validateStatus: () => true,
              });
              if (!lr) continue;
              const listData = Array.isArray(lr.data)
                ? lr.data
                : Array.isArray(lr.data?.data)
                ? lr.data.data
                : [];
              if (listData.length) {
                const match = listData.find(
                  (u: any) =>
                    String(u.user_id ?? u.id ?? u.userId) ===
                    String(member.user_id)
                );
                if (match) {
                  const foundEmail =
                    match?.email ||
                    match?.user_email ||
                    match?.email_address ||
                    (match?.profile &&
                      (match.profile.email || match.profile.user_email));
                  if (foundEmail) {
                    email = String(foundEmail);
                    // inform parent so it can cache/update members immediately
                    try {
                      onEmailResolved?.(member.user_id, email);
                    } catch {}
                    break;
                  }
                }
              }
            } catch (le) {
              // continue to next candidate
              console.debug(`Fallback user list ${candidate} failed:`, le);
            }
          }
        }
      } catch (err: any) {
        // Log server response to help debugging (500 etc.)
        console.error(
          `Error fetching user ${member.user_id}:`,
          err?.response?.data ?? err.message ?? err
        );
      }
    }

    // If still no email found, fall back to username if present, otherwise a clear ID token
    if (!email) {
      email = member?.username || `[ID:${userId}]`;
    }

    onRemoveMember(userId, email);
    handleClose();
  };

  const getInitials = (member: OrganizationMember) => {
    if (member.email) {
      return member.email.substring(0, 2).toUpperCase();
    }
    if (member.username) {
      return member.username.substring(0, 2).toUpperCase();
    }
    return member.user_id.substring(0, 2).toUpperCase();
  };

  const getDisplayName = (member: OrganizationMember) => {
    console.log(`[Debug] Displaying member ${member.user_id}:`, {
      member,
      cachedEmail: userEmails[member.user_id],
    });

    // Priorytet: username jeśli dostępny
    if (member.username) {
      return `@${member.username}`;
    }
    // Następnie rzeczywisty email z member.email jeśli dostępny
    if (member.email) {
      return member.email;
    }
    // Następnie email z cache jeśli jest i nie jest placeholderem
    if (
      userEmails[member.user_id] &&
      !userEmails[member.user_id].startsWith("[ID:")
    ) {
      return userEmails[member.user_id];
    }

    // Placeholder lub fallback
    if (loading || userEmails[member.user_id]?.startsWith("[ID:")) {
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <CircularProgress size={12} thickness={4} />
          <Typography
            component="span"
            sx={{ color: "text.secondary", fontStyle: "italic" }}
          >
            Ładowanie...
          </Typography>
        </Box>
      );
    }
    return (
      <Typography
        component="span"
        sx={{ color: "text.secondary", fontStyle: "italic" }}
      >
        Użytkownik #{member.user_id}
      </Typography>
    );
  };

  const getSortName = (member: OrganizationMember): string => {
    // Priorytet: username
    if (member.username) {
      return member.username.toLowerCase();
    }
    // Następnie email jeśli dostępny
    if (
      userEmails[member.user_id] &&
      !userEmails[member.user_id].startsWith("[ID:")
    ) {
      return userEmails[member.user_id].toLowerCase();
    }
    if (member.email) {
      return member.email.toLowerCase();
    }
    return `user_${member.user_id}`;
  };

  const sortedMembers = [...members].sort((a, b) => {
    // Właściciele na górze
    if (a.role === "owner" && b.role !== "owner") return -1;
    if (b.role === "owner" && a.role !== "owner") return 1;
    // Potem po liczbie like'ów (malejąco)
    const aLikes = userLikes[a.user_id] ?? 0;
    const bLikes = userLikes[b.user_id] ?? 0;
    if (bLikes !== aLikes) return bLikes - aLikes;
    // W ostateczności alfabetycznie
    return getSortName(a).localeCompare(getSortName(b));
  });

  // Fetch likes for members when menu opens (best-effort)
  React.useEffect(() => {
    if (!open) return;
    // If no orgId, try to compute from members' notes using global /notes/ (best-effort)
    const fetchLikes = async () => {
      setLikesLoading(true);
      try {
        const res = await api.get(`/notes/`, { validateStatus: () => true });
        if (!res) return;
        const listData = Array.isArray(res.data?.data)
          ? res.data.data
          : Array.isArray(res.data)
          ? res.data
          : [];

        const counts: Record<string, number> = {};
        for (const note of listData) {
          try {
            const nidOrg =
              note.organization_id ?? note.org_id ?? note.organization;
            // If orgId provided, filter notes to this organization, otherwise count all
            if (orgId && String(nidOrg) !== String(orgId)) continue;
            const uid = String(note.user_id ?? note.userId ?? note.user ?? "");
            const likes = Number(note.likes ?? 0) || 0;
            if (!uid) continue;
            counts[uid] = (counts[uid] || 0) + likes;
          } catch (e) {
            continue;
          }
        }
        setUserLikes(counts);
      } catch (e) {
        console.warn("Failed to fetch notes for likes ranking", e);
      } finally {
        setLikesLoading(false);
      }
    };

    void fetchLikes();
  }, [open, members, orgId]);

  return (
    <>
      <Tooltip title="Zarządzaj użytkownikami">
        <IconButton
          color="inherit"
          onClick={handleOpen}
          size="small"
          sx={{
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.15)",
            },
          }}
        >
          <Badge
            badgeContent={members.length}
            color={members.length > 0 ? "secondary" : "default"}
            max={99}
          >
            <GroupIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{
          paper: {
            sx: {
              width: 400,
              maxWidth: "90vw",
              maxHeight: "70vh",
              overflow: "auto",
            },
          },
        }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      >
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              Członkowie organizacji
            </Typography>
            <IconButton
              size="small"
              onClick={() => {
                onRefreshMembers();
              }}
              disabled={loading}
            >
              {loading ? (
                <CircularProgress size={16} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary">
            {members.length} {members.length === 1 ? "członek" : "członków"}
          </Typography>
        </Box>

        <Divider />

        {/* Members List */}
        {loading && members.length === 0 && (
          <MenuItem disabled>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 2,
              }}
            >
              <CircularProgress size={20} />
              <Typography>Ładowanie członków...</Typography>
            </Box>
          </MenuItem>
        )}

        {!loading && members.length === 0 && (
          <MenuItem disabled>
            <Typography color="text.secondary">
              Brak członków w organizacji
            </Typography>
          </MenuItem>
        )}

        {sortedMembers.map((member) => {
          const isCurrentUser =
            currentUserId && String(member.user_id) === String(currentUserId);
          const canRemove =
            isOwner && !isCurrentUser && member.role !== "owner";

          return (
            <MenuItem
              key={member.user_id}
              sx={{
                py: 1.5,
                px: 2,
                display: "flex",
                alignItems: "center",
                gap: 2,
                "&:hover": {
                  backgroundColor: "action.hover",
                },
              }}
              disabled={!canRemove}
            >
              {/* Avatar */}
              <Avatar
                sx={{
                  width: 40,
                  height: 40,
                  fontSize: "0.875rem",
                  bgcolor:
                    member.role === "owner" ? "primary.main" : "secondary.main",
                }}
              >
                {getInitials(member)}
              </Avatar>

              {/* User Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  <Typography
                    variant="body1"
                    fontWeight={500}
                    noWrap
                    sx={{ flex: 1 }}
                  >
                    {getDisplayName(member)}
                  </Typography>
                  {member.role && (
                    <Chip
                      label={
                        member.role === "owner" ? "Właściciel" : member.role
                      }
                      size="small"
                      color={member.role === "owner" ? "primary" : "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.6rem", height: 20 }}
                    />
                  )}
                  {isCurrentUser && (
                    <Chip
                      label="Ty"
                      size="small"
                      color="info"
                      variant="filled"
                      sx={{ fontSize: "0.6rem", height: 20 }}
                    />
                  )}
                  {/* Likes badge */}
                  <Box sx={{ display: "flex", alignItems: "center", ml: 1 }}>
                    {likesLoading ? (
                      <CircularProgress size={14} thickness={4} />
                    ) : (
                      <Chip
                        icon={<ThumbUpIcon fontSize="small" />}
                        label={userLikes[member.user_id] ?? 0}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: "0.6rem", height: 20, ml: 0.5 }}
                      />
                    )}
                  </Box>
                </Box>
                {member.username && member.username !== member.email && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    @{member.username}
                  </Typography>
                )}
              </Box>

              {/* Remove Button */}
              {canRemove && (
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => handleRemove(member.user_id, e)}
                  sx={{
                    "&:hover": {
                      backgroundColor: "error.light",
                      color: "error.contrastText",
                    },
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </MenuItem>
          );
        })}

        {!isOwner &&
          members.length > 0 && [
            <Divider key="owner-warning-divider" />,
            <Box key="owner-warning-box" sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Tylko właściciel może zarządzać członkami organizacji
              </Typography>
            </Box>,
          ]}
      </Menu>
    </>
  );
}
