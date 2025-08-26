import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatArea from "@/components/organization/ChatArea";

vi.mock("@/lib/api", () => ({
  default: {
    post: vi.fn(async () => ({ status: 200, data: { success: true } })),
    get: vi.fn(),
  },
}));

function Wrapper(p: Partial<Parameters<typeof ChatArea>[0]> = {}) {
  const now = new Date().toISOString();
  const [messageRatings, setMessageRatings] = React.useState<
    Record<string, { liked: boolean; disliked: boolean }>
  >({});
  const onRefresh = vi.fn();
  const props: Parameters<typeof ChatArea>[0] = {
    title: "Test Chat",
    messages: [
      {
        id: "m1",
        content: "Hello",
        created_at: now,
        user_id: "u1",
        likes: 0,
        dislikes: 0,
      },
    ],
    currentUserId: "u2",
    currentUserEmail: "u2@example.com",
    userColors: {},
    getUserInitials: (id: string) => "AB",
    selectedFile: null,
    onRemoveFile: () => {},
    newMessage: "",
    onChangeMessage: () => {},
    canSend: true,
    onSend: () => {},
    onDeleteMessage: () => {},
    onFileSelect: () => {},
    messageRatings,
    setMessageRatings,
    ratingsKey: "ratings_test",
    topicId: "t1",
    onRefresh,
    ...p,
  };
  return <ChatArea {...props} />;
}

function baseProps(): Parameters<typeof ChatArea>[0] {
  const now = new Date().toISOString();
  return {
    title: "Test Chat",
    messages: [
      {
        id: "m1",
        content: "Hello",
        created_at: now,
        user_id: "u1",
        likes: 0,
        dislikes: 0,
      },
    ],
    currentUserId: "u2",
    currentUserEmail: "u2@example.com",
    userColors: {},
    getUserInitials: (id: string) => "AB",
    selectedFile: null,
    onRemoveFile: () => {},
    newMessage: "",
    onChangeMessage: () => {},
    canSend: true,
    onSend: () => {},
    onDeleteMessage: () => {},
    onFileSelect: () => {},
    messageRatings: {},

    setMessageRatings: () => {},
    ratingsKey: "ratings_test",
    topicId: "t1",
    onRefresh: vi.fn(),
  };
}

describe("ChatArea reactions", () => {
  it("increments like counter immediately on Polub and toggles off on second click", async () => {
    const user = userEvent.setup();
    render(<Wrapper />);

    const plusBtn = screen.getByTestId("message-plus");
    fireEvent.click(plusBtn);

    const menu = screen.getByRole("menu");
    const polub = within(menu).getByText("Polub");
    await user.click(polub);

    const badge = await screen.findByTestId("message-reactions");
    expect(within(badge).getByText("1")).toBeInTheDocument();

    const plusBtn2 = screen.getByTestId("message-plus");
    fireEvent.click(plusBtn2);
    const polub2 = within(screen.getByRole("menu")).getByText("Polub");
    await user.click(polub2);

    expect(screen.queryByTestId("message-reactions")).not.toBeInTheDocument();
  });
});
