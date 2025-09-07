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
  Tooltip,
} from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import CloseIcon from "@mui/icons-material/Close";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
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

  // Initialize likes from message data
  React.useEffect(() => {
    const likesMap: Record<string, { count: number; liked: boolean }> = {};
    messages.forEach((msg) => {
      const count = typeof msg.likes === "number" ? msg.likes : 0;
      likesMap[String(msg.id)] = { count, liked: false };
    });
    setMessageLikes(likesMap);
    setConfirmedLikes(likesMap);
  }, [messages]);

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
  // Track pending like requests per message to avoid double submits
  const [pendingLikes, setPendingLikes] = React.useState<
    Record<string, boolean>
  >({});
  // ref mirror for immediate synchronous checks inside handlers
  const pendingLikesRef = React.useRef<Record<string, boolean>>({});
  // Store likes count for each message
  const [messageLikes, setMessageLikes] = React.useState<
    Record<string, { count: number; liked: boolean }>
  >({});
  // Store confirmed likes from server
  const [confirmedLikes, setConfirmedLikes] = React.useState<
    Record<string, { count: number; liked: boolean }>
  >({});
  // Store like animations
  const [likeAnimations, setLikeAnimations] = React.useState<
    Record<string, boolean>
  >({});
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

  // Handle keyboard events for lightbox
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && lightboxUrl) {
        closeLightbox();
      }
    };

    if (lightboxUrl) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when lightbox is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [lightboxUrl]);

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

  // Function to check and update like status for a specific message
  const checkLikeStatus = async (messageId: string) => {
    const messageKey = String(messageId);

    try {
      // Try to give like - if it fails with "already liked", then user has already liked
      const testLikeRes = await api.post(`/notes/give_like`, null, {
        params: { note_id: parseInt(messageId, 10) },
        validateStatus: () => true, // don't throw on error status
      });

      const detail = (testLikeRes?.data?.detail || "").toString().toLowerCase();

      if (testLikeRes.status === 400 && detail.includes("already")) {
        // User has already liked this message
        console.log(`Message ${messageId} is already liked by user`);
        setMessageLikes((prev) => ({
          ...prev,
          [messageKey]: {
            count: prev[messageKey]?.count || 0,
            liked: true,
          },
        }));
        setConfirmedLikes((prev) => ({
          ...prev,
          [messageKey]: {
            count: prev[messageKey]?.count || 0,
            liked: true,
          },
        }));
      } else if (testLikeRes.status >= 200 && testLikeRes.status < 300) {
        // Like was successful, so user hadn't liked before - undo it
        console.log(`Message ${messageId} was not liked, undoing test like`);
        await api.post(`/notes/give_dislike`, null, {
          params: { note_id: parseInt(messageId, 10) },
          validateStatus: () => true,
        });
        setMessageLikes((prev) => ({
          ...prev,
          [messageKey]: {
            count: prev[messageKey]?.count || 0,
            liked: false,
          },
        }));
        setConfirmedLikes((prev) => ({
          ...prev,
          [messageKey]: {
            count: prev[messageKey]?.count || 0,
            liked: false,
          },
        }));
      }
    } catch (err) {
      console.warn(
        `Failed to check like status for message ${messageId}:`,
        err
      );
    }
  };

  // Function to send like reaction to backend
  const sendLike = async (noteId: string, isLiking: boolean) => {
    const endpoint = isLiking ? `/notes/give_like` : `/notes/give_dislike`;
    const noteIdInt = parseInt(noteId, 10);

    if (isNaN(noteIdInt)) {
      console.error("Invalid noteId - cannot convert to integer:", noteId);
      throw new Error("Invalid note ID format");
    }

    // Check if user is authenticated
    const token =
      typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
    if (!token) {
      console.error("No authentication token found");
      throw new Error("Authentication required");
    }

    console.log("Sending like request:", {
      endpoint,
      noteId: noteIdInt,
      isLiking,
      originalNoteId: noteId,
      hasToken: !!token,
    });

    const res = await api.post(endpoint, null, {
      params: { note_id: noteIdInt },
      validateStatus: () => true, // prevent global error logging
    });

    const detail = (res?.data?.detail || "").toString().toLowerCase();
    if (res.status >= 200 && res.status < 300) return res;

    // Handle authentication errors
    if (res.status === 401) {
      console.error("Authentication error for like action:", res.data);
      throw Object.assign(new Error("Authentication required"), {
        response: { status: res.status, data: res.data },
      });
    }

    // Handle "already liked" or "not liked" cases - refresh state from server
    if (
      res.status === 400 &&
      (detail.includes("already like") ||
        detail.includes("already") ||
        detail.includes("not liked") ||
        detail.includes("no like") ||
        detail.includes("cannot like") ||
        detail.includes("own note") ||
        detail.includes("permission"))
    ) {
      console.log("Like action already completed or not allowed:", detail);

      // Refresh messages to get updated like state
      if (typeof props.onRefresh === "function") {
        try {
          console.log("Refreshing messages to sync like state");
          await props.onRefresh();
        } catch (refreshErr) {
          console.warn(
            "Failed to refresh messages after like error:",
            refreshErr
          );
        }
      }

      return { data: { ok: true } } as any;
    }

    console.error("Like request failed:", {
      endpoint,
      noteId: noteIdInt,
      isLiking,
      status: res.status,
      statusText: res.statusText,
      data: res.data,
      headers: res.headers,
    });

    throw Object.assign(new Error("Like request failed"), {
      response: { status: res.status, data: res.data },
    });
  };

  // Context menu state for like button
  const [contextMenu, setContextMenu] = React.useState<{
    mouseX: number;
    mouseY: number;
    messageId: string | null;
  } | null>(null);

  const handleContextMenu = (event: React.MouseEvent, messageId: string) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      messageId,
    });
  };

  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  const handleContextMenuAction = (action: "like" | "unlike") => {
    if (contextMenu?.messageId) {
      const currentLike = messageLikes[contextMenu.messageId];
      const isCurrentlyLiked = currentLike?.liked || false;

      if (
        (action === "like" && !isCurrentlyLiked) ||
        (action === "unlike" && isCurrentlyLiked)
      ) {
        handleLike(contextMenu.messageId, action === "like");
      }
    }
    handleContextMenuClose();
  };

  // Function to handle like/unlike action
  const handleLike = async (messageId: string, forceLikeState?: boolean) => {
    if (!myId) {
      console.warn("Cannot like message: user not authenticated (no myId)");
      alert("Musisz być zalogowany, aby polubić wiadomość");
      return;
    }

    const messageKey = String(messageId);
    if (pendingLikesRef.current[messageKey]) return;

    const currentLike = messageLikes[messageKey];
    const isCurrentlyLiked = currentLike?.liked || false;

    // Jeśli podano forceLikeState, użyj go; w przeciwnym razie przełącz stan
    const newLikedState =
      forceLikeState !== undefined ? forceLikeState : !isCurrentlyLiked;

    // Jeśli stan się nie zmienił, nie rób nic
    if (newLikedState === isCurrentlyLiked) return;

    console.log("Like action initiated:", {
      messageId,
      isCurrentlyLiked,
      newLikedState,
      forceLikeState,
      endpoint: newLikedState ? "/notes/give_like" : "/notes/give_dislike",
      userId: myId,
      currentLikeCount: currentLike?.count || 0,
    });

    // Mark as pending
    pendingLikesRef.current[messageKey] = true;
    setPendingLikes((prev) => ({ ...prev, [messageKey]: true }));

    // Add animation if liking
    if (newLikedState && !isCurrentlyLiked) {
      setLikeAnimations((prev) => ({ ...prev, [messageKey]: true }));
      setTimeout(() => {
        setLikeAnimations((prev) => ({ ...prev, [messageKey]: false }));
      }, 600);
    }

    // Optimistic update
    const newCount = newLikedState
      ? (currentLike?.count || 0) + 1
      : Math.max(0, (currentLike?.count || 0) - 1);

    setMessageLikes((prev) => ({
      ...prev,
      [messageKey]: { count: newCount, liked: newLikedState },
    }));

    try {
      await sendLike(messageKey, newLikedState);
      // Aktualizuj zarówno messageLikes jak i confirmedLikes po pomyślnym żądaniu
      setMessageLikes((prev) => ({
        ...prev,
        [messageKey]: { count: newCount, liked: newLikedState },
      }));
      setConfirmedLikes((prev) => ({
        ...prev,
        [messageKey]: { count: newCount, liked: newLikedState },
      }));

      // Refresh messages if parent provided refresh function
      if (typeof props.onRefresh === "function") {
        try {
          await props.onRefresh();
        } catch {}
      }
    } catch (err: any) {
      console.warn("Like action failed; rolling back", err);

      // Handle authentication errors specifically
      if (
        err.response?.status === 401 ||
        err.message?.includes("Authentication")
      ) {
        console.error("User not authenticated for like action");
        alert("Sesja wygasła. Zaloguj się ponownie.");
        // Clear invalid token
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
        }
        return;
      }

      // Handle 400 errors that indicate business logic issues
      if (err.response?.status === 400) {
        const detail = (err.response.data?.detail || "")
          .toString()
          .toLowerCase();
        if (detail.includes("own note") || detail.includes("cannot like")) {
          alert("Nie możesz polubić własnej notatki.");
        } else if (detail.includes("already") || detail.includes("not liked")) {
          console.log("Like state already correct, no action needed");
        } else {
          alert("Wystąpił błąd podczas przetwarzania polubienia.");
        }
        return;
      }

      // Rollback on other errors
      setMessageLikes((prev) => ({
        ...prev,
        [messageKey]: currentLike || { count: 0, liked: false },
      }));
    } finally {
      pendingLikesRef.current[messageKey] = false;
      setPendingLikes((prev) => {
        const copy = { ...prev };
        delete copy[messageKey];
        return copy;
      });
    }
  };

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
        height: "100%",
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
        sx={{
          flex: 1,
          overflowY: "auto",
          pt: 1,
          backgroundColor: "#fafafa",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!canSend ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
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
              flex: 1,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
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
                    position: "relative",
                    "&:hover .like-button": {
                      opacity: 1,
                      visibility: "visible",
                    },
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
                                maxWidth: "300px", // Limit szerokości miniaturek
                                maxHeight: "200px", // Limit wysokości miniaturek
                                width: "auto",
                                height: "auto",
                                borderRadius: 8,
                                display: "block",
                                cursor: "zoom-in",
                                objectFit: "cover", // Zachowaj proporcje, przytnij jeśli trzeba
                                transition: "transform 0.2s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = "scale(1.02)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "scale(1)";
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

                    {/* Like buttons and counter */}
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                        mt: 0.5,
                        opacity:
                          messageLikes[msg.id]?.count > 0 ||
                          messageLikes[msg.id]?.liked
                            ? 1
                            : 0,
                        visibility:
                          messageLikes[msg.id]?.count > 0 ||
                          messageLikes[msg.id]?.liked
                            ? "visible"
                            : "hidden",
                        transition: "opacity 0.2s ease, visibility 0.2s ease",
                      }}
                      className="like-button"
                    >
                      {/* Przycisk do dodawania polubienia - widoczny tylko gdy nie polubione */}
                      {!messageLikes[msg.id]?.liked && (
                        <Tooltip title="Polub tę wiadomość">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleLike(msg.id, true)}
                              disabled={pendingLikes[msg.id]}
                              sx={{
                                p: 0.5,
                                color: "#757575",
                                "&:hover": {
                                  backgroundColor: "rgba(233, 30, 99, 0.1)",
                                  color: "#e91e63",
                                  transform: "scale(1.1)",
                                },
                                "&.Mui-disabled": {
                                  color: "#bdbdbd",
                                },
                                transition: "all 0.2s ease",
                              }}
                            >
                              <FavoriteBorderIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}

                      {/* Przycisk do usuwania polubienia - widoczny tylko gdy polubione */}
                      {messageLikes[msg.id]?.liked && (
                        <Tooltip title="Usuń polubienie">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleLike(msg.id, false)}
                              disabled={pendingLikes[msg.id]}
                              className={
                                likeAnimations[msg.id] ? "like-animation" : ""
                              }
                              sx={{
                                p: 0.5,
                                color: "#e91e63",
                                backgroundColor: "rgba(233, 30, 99, 0.1)",
                                "&:hover": {
                                  backgroundColor: "rgba(244, 67, 54, 0.2)",
                                  color: "#f44336",
                                  transform: "scale(1.1)",
                                  boxShadow: "0 2px 8px rgba(244, 67, 54, 0.3)",
                                },
                                "&.Mui-disabled": {
                                  color: "#bdbdbd",
                                },
                                transition: "all 0.2s ease",
                                cursor: "pointer",
                              }}
                            >
                              <FavoriteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}

                      {/* Licznik polubień */}
                      {messageLikes[msg.id]?.count > 0 && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: messageLikes[msg.id]?.liked
                              ? "#e91e63"
                              : "#757575",
                            fontSize: "0.7rem",
                            fontWeight: 500,
                          }}
                        >
                          {messageLikes[msg.id].count}
                        </Typography>
                      )}
                    </Box>
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
          
          .like-animation {
            animation: likePulse 0.6s ease;
          }
          
          @keyframes likePulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
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
        maxWidth="lg"
        PaperProps={{
          sx: {
            backgroundColor: "#000",
            boxShadow: "none",
            maxHeight: "90vh",
            maxWidth: "90vw",
          },
        }}
      >
        <DialogContent
          sx={{
            p: 0,
            backgroundColor: "#000",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "50vh",
          }}
        >
          {/* Close button */}
          <IconButton
            onClick={closeLightbox}
            sx={{
              position: "absolute",
              top: 16,
              right: 16,
              color: "white",
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.7)",
              },
              zIndex: 1,
            }}
          >
            <CloseIcon />
          </IconButton>

          {lightboxUrl ? (
            <img
              src={lightboxUrl}
              alt="Podgląd pełnoekranowy"
              style={{
                maxWidth: "100%",
                maxHeight: "80vh",
                width: "auto",
                height: "auto",
                display: "block",
                objectFit: "contain",
                cursor: "zoom-out",
              }}
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
      {/* Context menu for like button */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        {contextMenu?.messageId &&
        messageLikes[contextMenu.messageId]?.liked ? (
          <MenuItem onClick={() => handleContextMenuAction("unlike")}>
            <FavoriteIcon sx={{ mr: 1, color: "#e91e63" }} fontSize="small" />
            Usuń polubienie
          </MenuItem>
        ) : (
          <MenuItem onClick={() => handleContextMenuAction("like")}>
            <FavoriteBorderIcon
              sx={{ mr: 1, color: "#757575" }}
              fontSize="small"
            />
            Dodaj polubienie
          </MenuItem>
        )}
      </Menu>

      <Divider />
      <CardActions
        sx={{
          p: 2,
          flexDirection: "column",
          gap: 1,
          backgroundColor: "white",
          flexShrink: 0,
          borderTop: "1px solid #e0e0e0",
        }}
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
                    maxWidth: "100px", // Dodatkowy limit dla preview
                    maxHeight: "100px",
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
