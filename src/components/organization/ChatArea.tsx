"use client";
import React from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardActions,
  Typography,
  Divider,
  Box,
  TextField,
  IconButton,
  Button,
  Avatar,
  Menu,
  MenuItem,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Chip,
} from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import SendIcon from "@mui/icons-material/Send";
import DeleteIcon from "@mui/icons-material/Delete";
import { Message } from "./types";
import api from "@/lib/api";
import { MEDIA_BASE, buildImageProxyUrl } from "@/lib/config";

/* eslint-disable @next/next/no-img-element */

// Local extended message shape for safer property access without `any`
type MessageExtended = Message & {
  user?: {
    id?: string | number;
    user_id?: string | number;
    email?: string;
    avatar_url?: string;
  };
  user_email?: string;
  email?: string;
  email_address?: string;
  userId?: string | number;
  avatar_url?: string;
};

export interface ChatAreaProps {
  title: string;
  messages: Message[];
  currentUserId: string | null;
  currentUserEmail?: string | null;
  userColors: Record<string, string>;
  getUserInitials: (userId: string) => string;
  selectedFile: File | null;
  onRemoveFile: () => void;
  newMessage: string;
  onChangeMessage: (v: string) => void;
  canSend: boolean;
  onSend: () => void;
  onDeleteMessage: (id: string) => void; // kept for compatibility, not rendered
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  messageRatings: Record<string, { liked: boolean; disliked: boolean }>; // kept, not used
  setMessageRatings: React.Dispatch<
    React.SetStateAction<Record<string, { liked: boolean; disliked: boolean }>>
  >; // kept, not used
  ratingsKey: string; // kept, not used
  // Currently selected topic id (required for backend AI summary endpoint)
  topicId: string | null;
  onRefresh?: () => Promise<void> | void;
}

export default function ChatArea(props: ChatAreaProps) {
  const {
    title,
    messages,
    currentUserId,
    currentUserEmail,
    userColors,
    getUserInitials,
    selectedFile,
    onRemoveFile,
    newMessage,
    onChangeMessage,
    canSend,
    onSend,
    onDeleteMessage,
    onFileSelect,
    messageRatings,
    setMessageRatings,
    ratingsKey,
    topicId,
  } = props;

  // Robustly resolve current user id (fallback to localStorage if prop is missing)
  const myId = React.useMemo(() => {
    if (currentUserId) return String(currentUserId);
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      const candidate = u?.id ?? u?.user_id ?? u?.data?.id ?? u?.data?.user_id;
      return candidate != null ? String(candidate) : null;
    } catch {
      return null;
    }
  }, [currentUserId]);

  // Resolve current user email (prefer explicit prop, fallback to localStorage)
  const myEmail = React.useMemo(() => {
    if (currentUserEmail) return String(currentUserEmail);
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      const candidate = u?.email || u?.user_email || u?.email_address || null;
      return candidate != null ? String(candidate) : null;
    } catch {
      return null;
    }
  }, [currentUserEmail]);

  // Resolve current user's avatar from localStorage (fallback when messages don't include avatar)
  const myAvatar = React.useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return null;
      const u = JSON.parse(raw);
      return u?.avatar_url || u?.avatar || null;
    } catch {
      return null;
    }
  }, []);

  // Cache avatarów: userId -> url; wczytaj z localStorage i zapisuj zmiany
  const [avatarMap, setAvatarMap] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("avatar_map_v1");
      if (raw) setAvatarMap(JSON.parse(raw));
    } catch {}
  }, []);
  React.useEffect(() => {
    try {
      localStorage.setItem("avatar_map_v1", JSON.stringify(avatarMap));
    } catch {}
  }, [avatarMap]);

  // Upewnij się, że własny avatar jest w mapie (pozwala innym komponentom i temu widokowi korzystać z cache)
  React.useEffect(() => {
    if (!myId || !myAvatar) return;
    const key = String(myId);
    const resolved = resolveAssetUrl(myAvatar) || myAvatar;
    setAvatarMap((prev) => (prev[key] ? prev : { ...prev, [key]: resolved }));
  }, [myId, myAvatar]);

  // Preload avatarów autorów wiadomości z /users/{id}
  React.useEffect(() => {
    const uniqueIds = new Set<string>();
    for (const m of messages) {
      const me = m as MessageExtended;
      const uid = String(me.user?.id ?? me.user_id ?? "");
      if (uid) uniqueIds.add(uid);
    }
    const toFetch = Array.from(uniqueIds).filter(
      (uid) => !avatarMap[uid] && uid !== (myId || "")
    );
    if (!toFetch.length) return;
    (async () => {
      try {
        const results = await Promise.all(
          toFetch.map(async (uid) => {
            try {
              const res = await api.get(`/users/${uid}`);
              const envelope = res.data;
              const data = envelope?.data ?? envelope;
              const avatarPath = data?.avatar_url || data?.avatar || null;
              if (avatarPath) {
                const url = resolveAssetUrl(avatarPath) || String(avatarPath);
                return { uid, url } as const;
              }
            } catch {}
            return null;
          })
        );
        const additions: Record<string, string> = {};
        for (const r of results) {
          if (r && r.url) additions[r.uid] = r.url;
        }
        if (Object.keys(additions).length) {
          setAvatarMap((prev) => ({ ...prev, ...additions }));
        }
      } catch {}
    })();
  }, [messages, avatarMap, myId]);

  // Dev-only debug logging: enable by setting localStorage.setItem('chat_debug','1')
  React.useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (localStorage.getItem("chat_debug") !== "1") return;
      console.debug(
        "[ChatArea debug] resolved myId=",
        myId,
        " myEmail=",
        myEmail
      );
      if (!messages || messages.length === 0) {
        console.debug("[ChatArea debug] no messages");
        return;
      }
      messages.slice(0, 10).forEach((m, i) => {
        const me = m as MessageExtended;
        const nested = me.user;
        const emails = [me.user_email, me.email, me.email_address]
          .filter(Boolean)
          .join(" |");
        console.debug(
          `[ChatArea debug] msg[${i}] id=${m.id} user_id=${me.user_id} nestedUser=`,
          nested,
          ` emails=${emails}`
        );
      });
    } catch {
      // swallow
    }
  }, [messages, myId, myEmail]);

  // Deterministic color per user id so all clients see the same colors
  const getColorForUser = (userId: string) => {
    const palette = [
      "#e57373",
      "#64b5f6",
      "#81c784",
      "#ffb74d",
      "#9575cd",
      "#4db6ac",
      "#ba68c8",
      "#90a4ae",
      "#f06292",
      "#7986cb",
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
      hash |= 0;
    }
    const idx = Math.abs(hash) % palette.length;
    return palette[idx];
  };

  // Capture initial ratings - REMOVED for Messenger-like appearance

  // Functions for displaying likes/dislikes - REMOVED for Messenger-like appearance
  const isImageLink = (url?: string) =>
    !!url && /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);

  // Resolve backend asset URLs (avatar, attachments) returned as filenames or relative paths
  const resolveAssetUrl = (val?: string | null | undefined) => {
    if (!val) {
      return undefined;
    }
    try {
      const s = String(val);
      if (/^https?:\/\//i.test(s)) {
        return s;
      }

      // Per requirement: map any path that references note_imgs to the
      // media server URL: http://localhost:8000/media/note_imgs/<filename>
      // Extract filename (last path segment) and build URL.
      const mapToLocalMedia = (p: string) => {
        // Find the segment 'note_imgs' and preserve everything after it (e.g. /note_imgs/<orgId>/<file>)
        const idx = p.indexOf("note_imgs");
        let suffix = "";
        if (idx !== -1) {
          suffix = p.slice(idx + "note_imgs".length);
        } else {
          // fallback: use full path basename
          const parts = p.split("/").filter(Boolean);
          suffix = parts.length ? `/${parts[parts.length - 1]}` : `/${p}`;
        }
        // Ensure leading slash
        if (!suffix.startsWith("/")) suffix = `/${suffix}`;
        // Use our Next.js image proxy to handle CORS and Content-Type issues
        return buildImageProxyUrl(
          `${MEDIA_BASE.replace(/\/$/, "")}/media/note_imgs${suffix}`
        );
      };

      // If the backend returns an /api/backend path that contains note_imgs,
      // rewrite it to the requested media server path
      if (s.startsWith("/api/backend")) {
        const tail = s.replace(/^\/api\/backend/, "");
        if (tail.includes("note_imgs")) {
          const result = mapToLocalMedia(tail);
          return result;
        }
        // Map avatar media paths to media server as well
        if (tail.includes("avatars") || tail.includes("avatar")) {
          // preserve everything after 'avatars' segment
          const idxA = tail.indexOf("avatars");
          const suffixA =
            idxA !== -1 ? tail.slice(idxA + "avatars".length) : tail;
          let sfx = suffixA;
          if (!sfx.startsWith("/")) sfx = `/${sfx}`;
          return buildImageProxyUrl(
            `${MEDIA_BASE.replace(/\/$/, "")}/media/avatars${sfx}`
          );
        }
        return s;
      }

      // If the value already references note_imgs (e.g. "note_imgs/.." or "/note_imgs/.."),
      // map it to the media server
      if (s.includes("note_imgs")) {
        const result = mapToLocalMedia(s);
        return result;
      }
      // Map avatar paths to media server when backend stores them under media/avatars
      if (s.includes("avatars") || s.includes("avatar")) {
        // Find 'avatars' occurrence and preserve suffix
        const idx = s.indexOf("avatars");
        let suffix = idx !== -1 ? s.slice(idx + "avatars".length) : s;
        if (!suffix.startsWith("/")) suffix = `/${suffix}`;
        return buildImageProxyUrl(
          `${MEDIA_BASE.replace(/\/$/, "")}/media/avatars${suffix}`
        );
      }

      // Otherwise map to backend proxy endpoint as before
      return `/api/backend${s.startsWith("/") ? "" : "/"}${s}`;
    } catch {
      return undefined;
    }
  };

  // Plus menu state - REMOVED for Messenger-like appearance
  // Track pending like/dislike requests per message - REMOVED for Messenger-like appearance
  const closeMenu = () => {
    // Menu removed for Messenger-like appearance
  };

  // Track image render failures to fallback to a link
  const [failedImages, setFailedImages] = React.useState<
    Record<string, boolean>
  >({});
  const markImageFailed = (id: string) =>
    setFailedImages((prev) => ({ ...prev, [id]: true }));

  // Images are now served directly through proxy - no need for blob URL cache

  // Locally order messages so newest appear at the bottom
  const orderedMessages = React.useMemo(() => {
    const arr = [...messages];
    arr.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return arr;
  }, [messages]);

  // Robust helper: determine whether a message belongs to the current user
  const isMessageFromMe = (msg: Message) => {
    // If we have neither id nor email for current user, we can't match
    if (myId == null && myEmail == null) return false;

    // Normalize message author id/email candidates
    const candidates: string[] = [];
    const m = msg as MessageExtended;
    // common id fields
    const idFields = [m.user_id, m.userId, m.id];
    idFields.forEach((f) => {
      if (f != null) candidates.push(String(f));
    });
    // nested user object
    const nestedUser = m.user;
    if (nestedUser) {
      if (nestedUser.id != null) candidates.push(String(nestedUser.id));
      if (nestedUser.user_id != null)
        candidates.push(String(nestedUser.user_id));
      if (nestedUser.email) candidates.push(String(nestedUser.email));
    }
    // common email fields
    const emailFields = [m.user_email, m.email, m.email_address];
    emailFields.forEach((e) => e != null && candidates.push(String(e)));

    // Compare using id if available
    if (myId != null) {
      const mid = String(myId);
      if (candidates.some((c) => c === mid)) return true;
      // also compare numeric forms (strip non-digits)
      const digitsMid = mid.replace(/\D/g, "");
      if (
        digitsMid &&
        candidates.some((c) => c.replace(/\D/g, "") === digitsMid)
      )
        return true;
    }

    // Compare using email if available
    if (myEmail != null) {
      const mem = String(myEmail).toLowerCase();
      if (candidates.some((c) => String(c).toLowerCase() === mem)) return true;
    }

    return false;
  };

  // Lightbox state for images
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const openLightbox = (url: string) => setLightboxUrl(url);
  const closeLightbox = () => setLightboxUrl(null);

  // Summary dialog state
  const [summaryOpen, setSummaryOpen] = React.useState(false);
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [summaryText, setSummaryText] = React.useState<string>("");
  const [summaryError, setSummaryError] = React.useState<string>("");

  const handleSummarize = async () => {
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryError("");
    setSummaryText("");
    try {
      let summary: string | null = null;
      let lastErr: unknown = null;

      // Backend-first: according to API contract, create summary via POST /ai_summary/?topic_id=...
      if (topicId) {
        try {
          const res = await api.post(`/ai_summary/`, null, {
            params: { topic_id: Number(topicId) },
          });
          const raw = res?.data ?? {};
          const data = raw?.data ?? raw; // unwrap if wrapped
          const candidate =
            data?.summary_text || data?.summary || data?.text || "";
          if (typeof candidate === "string" && candidate.length > 0) {
            summary = candidate;
          }
        } catch (err1: unknown) {
          lastErr = err1;
          // Retry without trailing slash (some setups differ)
          try {
            const res2 = await api.post(`/ai_summary`, null, {
              params: { topic_id: Number(topicId) },
            });
            const raw2 = res2?.data ?? {};
            const data2 = raw2?.data ?? raw2;
            const candidate2 =
              data2?.summary_text || data2?.summary || data2?.text || "";
            if (typeof candidate2 === "string" && candidate2.length > 0) {
              summary = candidate2;
            }
          } catch (err2: unknown) {
            lastErr = err2;
          }
        }
      }

      // Fallback to local summarizer if backend endpoints are unavailable
      if (!summary) {
        try {
          const payload = {
            messages: messages.map((m) => ({
              id: String(m.id),
              content: m.content ?? "",
              created_at: m.created_at,
              user_id: String(m.user_id),
              image_url: m.image_url || null,
            })),
            locale: "pl",
          };
          const resp = await fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data?.error || "Błąd podsumowania");
          summary = String(data.summary || "");
        } catch (err: unknown) {
          lastErr = err;
        }
      }

      if (!summary) {
        throw lastErr || new Error("Nie udało się wygenerować podsumowania");
      }
      setSummaryText(summary);
    } catch (err) {
      setSummaryError(
        err instanceof Error
          ? err.message
          : String(err) || "Nie udało się wygenerować podsumowania"
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  // Unified reaction sender - REMOVED for Messenger-like appearance

  // Preview for locally selected file (before it's uploaded)
  const [selectedFilePreview, setSelectedFilePreview] = React.useState<
    string | null
  >(null);
  React.useEffect(() => {
    if (!selectedFile) {
      setSelectedFilePreview(null);
      return;
    }
    if (selectedFile.type?.startsWith("image/")) {
      const url = URL.createObjectURL(selectedFile);
      setSelectedFilePreview(url);
      return () => {
        URL.revokeObjectURL(url);
        setSelectedFilePreview(null);
      };
    }
    setSelectedFilePreview(null);
  }, [selectedFile]);

  // Auto-scroll to bottom on messages or typing changes
  const bottomRef = React.useRef<HTMLDivElement | null>(null);
  // Ref to the scrollable container so we can check user scroll position
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    // If the user is already scrolled up (not near the bottom), don't force-scroll.
    const threshold = 150; // pixels from bottom considered "near bottom"
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > threshold) {
      // user scrolled away — don't auto-scroll
      return;
    }
    // Otherwise, smoothly scroll to bottom
    const t = setTimeout(() => {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } catch {
        // fallback
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [orderedMessages.length, newMessage]);

  // Helpers
  const formatDayLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (isSameDay(d, today)) return "Dziś";
    if (isSameDay(d, yesterday)) return "Wczoraj";
    return d.toLocaleDateString();
  };

  // (removed duplicate bottomRef/effect)

  return (
    <Card
      sx={{
        flex: 1,
        borderRadius: 0,
        boxShadow: "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardHeader
        avatar={<ChatBubbleOutlineIcon sx={{ color: "#3498db" }} />}
        title={
          <Typography variant="h6" sx={{ fontWeight: 600, color: "#2c3e50" }}>
            {title}
          </Typography>
        }
        action={
          <Button
            size="small"
            variant="outlined"
            onClick={handleSummarize}
            disabled={!canSend || messages.length === 0}
          >
            Podsumuj
          </Button>
        }
        sx={{
          pb: 1,
          backgroundColor: "white",
          borderBottom: "1px solid #e0e0e0",
        }}
      />
      <CardContent
        ref={contentRef}
        sx={{ flex: 1, overflowY: "auto", pt: 1, backgroundColor: "#fafafa" }}
      >
        {!canSend ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              📝 Wybierz temat aby zobaczyć wiadomości
            </Typography>
          </Box>
        ) : messages.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
              color: "text.secondary",
            }}
          >
            <Typography variant="body2">
              💬 Brak wiadomości w tym temacie. Napisz pierwszą!
            </Typography>
          </Box>
        ) : (
          // Render with date separators
          orderedMessages.map((msg, idx) => {
            const me = msg as MessageExtended;
            const prev = orderedMessages[idx - 1];
            const showDateSeparator =
              !prev ||
              new Date(prev.created_at).toDateString() !==
                new Date(msg.created_at).toDateString();
            const isOwn = isMessageFromMe(msg);
            return (
              <React.Fragment key={msg.id}>
                {showDateSeparator && (
                  <Box sx={{ width: "100%", my: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Divider sx={{ flex: 1 }} />
                      <Chip
                        size="small"
                        label={formatDayLabel(msg.created_at)}
                      />
                      <Divider sx={{ flex: 1 }} />
                    </Box>
                  </Box>
                )}
                <Box
                  sx={{
                    width: "100%",
                    display: "flex",
                    justifyContent: isOwn ? "flex-end" : "flex-start",
                    alignItems: "flex-end",
                    mb: 2,
                    gap: 1,
                  }}
                >
                  {/* Avatar for other users (left side) */}
                  {!isOwn && (
                    <Avatar
                      src={
                        resolveAssetUrl(
                          (me.user &&
                            (me.user.avatar_url ||
                              (me.user as { avatar?: string }).avatar)) ||
                            me.avatar_url ||
                            (me as MessageExtended & { avatar?: string })
                              .avatar ||
                            undefined
                        ) ||
                        avatarMap[
                          String(me.user?.id ?? me.user_id ?? me.id ?? "")
                        ]
                      }
                      sx={{
                        width: 32,
                        height: 32,
                        backgroundColor:
                          userColors[msg.user_id] ??
                          getColorForUser(String(msg.user_id)),
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        border: "2px solid #e0e0e0",
                      }}
                    >
                      {!(
                        me.user &&
                        (me.user.avatar_url ||
                          (me.user as { avatar?: string }).avatar)
                      ) &&
                        !(
                          me.avatar_url ||
                          (me as MessageExtended & { avatar?: string }).avatar
                        ) &&
                        getUserInitials(
                          String(me.user?.id ?? me.user_id ?? me.id ?? "")
                        )}
                    </Avatar>
                  )}

                  {/* Message bubble */}
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      maxWidth: "70%",
                      alignItems: isOwn ? "flex-end" : "flex-start",
                    }}
                  >
                    {/* Message content */}
                    <Box
                      sx={{
                        p: 2,
                        position: "relative",
                        backgroundColor: isOwn ? "#0084ff" : "#e4e6ea",
                        color: isOwn ? "white" : "#1c1e21",
                        borderRadius: isOwn
                          ? "18px 18px 4px 18px"
                          : "18px 18px 18px 4px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                        wordWrap: "break-word",
                      }}
                    >
                      {/* Image/file attachment preview */}
                      {msg.image_url &&
                        (!failedImages[msg.id] ? (
                          <Box sx={{ mt: 0.5, mb: 1 }}>
                            <img
                              src={resolveAssetUrl(msg.image_url)}
                              alt="Załącznik"
                              onError={() => {
                                console.warn("[Image Error] Failed to load", {
                                  image_url: msg.image_url,
                                });
                                markImageFailed(msg.id);
                              }}
                              onLoad={() => {
                                // no-op; image loaded successfully
                              }}
                              onClick={() =>
                                openLightbox(
                                  resolveAssetUrl(msg.image_url) || ""
                                )
                              }
                              style={{
                                maxWidth: "100%",
                                borderRadius: 8,
                                display: "block",
                                cursor: "zoom-in",
                              }}
                            />
                          </Box>
                        ) : (
                          <Box sx={{ mt: 0.5, mb: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 500 }}
                            >
                              <a
                                href={
                                  resolveAssetUrl(msg.image_url) ||
                                  msg.image_url
                                }
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: "inherit",
                                  textDecoration: "underline",
                                }}
                              >
                                Pobierz załącznik
                              </a>
                            </Typography>
                          </Box>
                        ))}
                      {msg.content?.trim() ? (
                        <Typography variant="body2" sx={{ fontWeight: 400 }}>
                          {msg.content}
                        </Typography>
                      ) : null}
                    </Box>

                    {/* Timestamp */}
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        mt: 0.5,
                        fontSize: "0.7rem",
                        px: 1,
                      }}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Typography>
                  </Box>

                  {/* Avatar for own messages (right side) */}
                  {isOwn && (
                    <Avatar
                      src={
                        resolveAssetUrl(myAvatar || undefined) ||
                        avatarMap[String(myId || "")]
                      }
                      sx={{
                        width: 32,
                        height: 32,
                        backgroundColor:
                          userColors[myId || ""] ??
                          getColorForUser(String(myId || "")),
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        border: "2px solid #e0e0e0",
                      }}
                    >
                      {getUserInitials(String(myId || ""))}
                    </Avatar>
                  )}
                </Box>
              </React.Fragment>
            );
          })
        )}
        {/* Typing indicator (local) */}
        {newMessage?.trim() ? (
          <Box
            sx={{ display: "flex", justifyContent: "flex-end", pr: 1, pb: 0.5 }}
          >
            <Box
              sx={{
                backgroundColor: "#eceff1",
                borderRadius: 2,
                px: 1.25,
                py: 0.75,
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: "#90a4ae",
                  display: "inline-block",
                  animation: "blink 1.2s infinite",
                }}
              />
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: "#90a4ae",
                  display: "inline-block",
                  animation: "blink 1.2s 0.2s infinite",
                }}
              />
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: "#90a4ae",
                  display: "inline-block",
                  animation: "blink 1.2s 0.4s infinite",
                }}
              />
            </Box>
          </Box>
        ) : null}
        <style>{`
          @keyframes blink {
            0% { opacity: 0.2; transform: translateY(0px); }
            20% { opacity: 1; transform: translateY(-1px); }
            100% { opacity: 0.2; transform: translateY(0px); }
          }
        `}</style>
        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </CardContent>
      {/* Lightbox dialog */}
      <Dialog
        open={!!lightboxUrl}
        onClose={closeLightbox}
        fullWidth
        maxWidth="md"
      >
        <DialogContent sx={{ p: 0, backgroundColor: "#000" }}>
          {lightboxUrl ? (
            <img
              src={lightboxUrl}
              alt="Podgląd"
              style={{ width: "100%", height: "auto", display: "block" }}
              onClick={closeLightbox}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Summary dialog */}
      <Dialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Podsumowanie</DialogTitle>
        <DialogContent dividers>
          {summaryLoading ? (
            <Typography variant="body2">Generuję podsumowanie…</Typography>
          ) : summaryError ? (
            <Typography color="error" variant="body2">
              {summaryError}
            </Typography>
          ) : summaryText ? (
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {summaryText}
            </Typography>
          ) : (
            <Typography variant="body2">
              Brak danych do wyświetlenia.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSummaryOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>
      {/* Menu removed for Messenger-like appearance */}
      <Divider />
      <CardActions
        sx={{ p: 2, flexDirection: "column", gap: 1, backgroundColor: "white" }}
      >
        {selectedFile && (
          <Box
            sx={{
              width: "100%",
              p: 1,
              backgroundColor: "#f0f8ff",
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid #e3f2fd",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {selectedFilePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedFilePreview}
                  alt={selectedFile.name}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "cover",
                    borderRadius: 6,
                  }}
                />
              ) : (
                <Box
                  sx={{
                    width: 72,
                    height: 72,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#ffffff",
                    borderRadius: 1,
                    border: "1px solid #e0e0e0",
                  }}
                >
                  <Typography variant="caption">{selectedFile.name}</Typography>
                </Box>
              )}
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {selectedFile.name}
              </Typography>
            </Box>
            <Box>
              <IconButton
                size="small"
                onClick={onRemoveFile}
                sx={{
                  "&:hover": { backgroundColor: "#e74c3c", color: "white" },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        )}
        <Box
          sx={{ display: "flex", width: "100%", gap: 1, alignItems: "center" }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder={
              canSend
                ? "Napisz wiadomość..."
                : "Wybierz temat aby pisać wiadomości"
            }
            value={newMessage}
            onChange={(e) => onChangeMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSend && onSend()}
            disabled={!canSend}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: "20px" } }}
          />
          <input
            accept="image/*,application/pdf,.doc,.docx,.txt"
            style={{ display: "none" }}
            id="file-upload"
            type="file"
            onChange={onFileSelect}
          />
          <label htmlFor="file-upload">
            <IconButton
              component="span"
              sx={{
                color: "#7f8c8d",
                "&:hover": { backgroundColor: "#ecf0f1", color: "#2c3e50" },
              }}
            >
              <AttachFileIcon />
            </IconButton>
          </label>
          <Button
            variant="contained"
            onClick={onSend}
            disabled={!canSend}
            startIcon={<SendIcon />}
            sx={{
              borderRadius: "20px",
              textTransform: "none",
              fontWeight: 500,
              minWidth: "80px",
              backgroundColor: "#3498db",
              "&:hover": { backgroundColor: "#2980b9" },
            }}
          >
            Wyślij
          </Button>
        </Box>
      </CardActions>
    </Card>
  );
}
