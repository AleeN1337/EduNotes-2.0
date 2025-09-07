import api from "./api";
import { User, ApiResponse, LoginForm, RegisterForm } from "@/types";

// Tymczasowy mock dla logowania (do celów deweloperskich)
const MOCK_TOKEN = "mock-jwt-token-12345";
const MOCK_USERS: Record<string, User> = {
  "test@example.com": {
    id: "3",
    email: "test@example.com",
    username: "testuser",
    firstName: "Jan",
    lastName: "Kowalski",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  "test2@example.com": {
    id: "5",
    email: "test2@example.com",
    username: "testuser2",
    firstName: "Anna",
    lastName: "Nowak",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

export class AuthAPI {
  static async login(
    data: LoginForm
  ): Promise<ApiResponse<User & { token: string }>> {
    try {
      // Najpierw spróbuj prawdziwego API
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Prawdziwe logowanie zadziałało
        if (result.token) {
          localStorage.setItem("auth_token", result.token);
          // Zapisz użytkownika tylko jeśli nie jest null; w przeciwnym razie użyj minimalnych danych
          const backendUser = result.user as any | null;
          const minimalUser: any = {
            id: "temp",
            email: data.email,
            username: data.email.split("@")[0],
            firstName: "",
            lastName: "",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          // Normalize user shape to always have string id and email
          const rawUser = backendUser ?? minimalUser;
          const normalizedUser = {
            ...rawUser,
            id: String(
              rawUser.id ?? rawUser.user_id ?? rawUser?.data?.id ?? ""
            ),
            email:
              rawUser.email ||
              rawUser.user_email ||
              rawUser.email_address ||
              null,
          };
          localStorage.setItem("user", JSON.stringify(normalizedUser));

          // Dodaj również do cookies dla middleware
          document.cookie = `auth_token=${result.token}; path=/; max-age=86400; samesite=lax`;

          // Reset session start time on login
          localStorage.setItem("session_start", Date.now().toString());
        }
        return result;
      } else {
        // Fallback do mock logowania dla developmentu
        console.warn("Backend login failed, using mock login for development");

        const mockUser = MOCK_USERS[data.email];
        if (mockUser) {
          localStorage.setItem("auth_token", MOCK_TOKEN);
          // ensure id is string and email present
          const normalizedMock = {
            ...mockUser,
            id: String(mockUser.id),
            email: mockUser.email || null,
          };
          localStorage.setItem("user", JSON.stringify(normalizedMock));

          // Dodaj również do cookies
          document.cookie = `auth_token=${MOCK_TOKEN}; path=/; max-age=86400; samesite=lax`;

          // Reset session start time on login
          localStorage.setItem("session_start", Date.now().toString());

          return {
            success: true,
            data: { ...mockUser, token: MOCK_TOKEN },
            message: "Mock login successful",
          };
        } else {
          throw new Error("Nie znaleziono użytkownika (mock)");
        }
      }
    } catch (error: any) {
      // Jeśli wszystko zawodzi, spróbuj mock logowania
      console.warn("API call failed, trying mock login:", error.message);

      const mockUser = MOCK_USERS[data.email];
      if (mockUser) {
        localStorage.setItem("auth_token", MOCK_TOKEN);
        const normalizedMock = {
          ...mockUser,
          id: String(mockUser.id),
          email: mockUser.email || null,
        };
        localStorage.setItem("user", JSON.stringify(normalizedMock));

        // Dodaj również do cookies
        document.cookie = `auth_token=${MOCK_TOKEN}; path=/; max-age=86400; samesite=lax`;

        // Reset session start time on login
        localStorage.setItem("session_start", Date.now().toString());

        return {
          success: true,
          data: { ...mockUser, token: MOCK_TOKEN },
          message: "Mock login successful",
        };
      }

      throw new Error("Błąd logowania");
    }
  }

  static async register(
    data: RegisterForm
  ): Promise<ApiResponse<User & { token: string }>> {
    try {
      // Wywołaj prawdziwe API rejestracji
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      });
      let result: any;
      try {
        result = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text || "Błąd rejestracji");
      }
      if (!response.ok || result?.success === false) {
        const message =
          result?.message ||
          (Array.isArray(result?.detail)
            ? result.detail
                .map((d: any) => d?.msg)
                .filter(Boolean)
                .join("; ")
            : result?.detail) ||
          "Błąd rejestracji";
        throw new Error(message);
      }
      // Użyj tokena i danych użytkownika z odpowiedzi
      const token = result.token as string | undefined;
      const backendUser = result.user as User;
      // Zapisz w localStorage i ciasteczkach
      if (token) {
        localStorage.setItem("auth_token", token);
        document.cookie = `auth_token=${token}; path=/; max-age=86400; samesite=lax`;
      }
      // Normalize stored user
      const rawUser = backendUser as any;
      const normalized = {
        ...rawUser,
        id: String(rawUser.id ?? rawUser.user_id ?? ""),
        email:
          rawUser.email || rawUser.user_email || rawUser.email_address || null,
      };
      localStorage.setItem("user", JSON.stringify(normalized));
      // Reset session start time on registration
      localStorage.setItem("session_start", Date.now().toString());
      return {
        success: true,
        data: { ...backendUser, token: token ?? "" },
        message: result.message || "Rejestracja przebiegła pomyślnie",
      };
    } catch (error: any) {
      throw new Error(error.message || "Błąd rejestracji");
    }
  }

  static async logout(): Promise<void> {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    // Reset session start time only on logout
    localStorage.removeItem("session_start");

    // Usuń również z cookies
    document.cookie =
      "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }

  static async getCurrentUser(): Promise<User | null> {
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) return null;

      // Zawsze najpierw spróbuj localStorage (dla wszystkich tokenów)
      const userJson = localStorage.getItem("user");
      if (userJson) {
        try {
          const raw = JSON.parse(userJson);
          const user = {
            ...raw,
            id: String(raw.id ?? raw.user_id ?? ""),
            email: raw.email || raw.user_email || raw.email_address || null,
          };
          console.log("AuthAPI: Using stored user data:", user);
          if (user) {
            return user;
          }
        } catch (parseError) {
          console.warn("Failed to parse user from localStorage:", parseError);
        }
      }

      // Jeśli to mock token, nie próbuj API
      if (token === MOCK_TOKEN) {
        console.log("AuthAPI: Mock token detected, no API call needed");
        return null;
      }

      // Dla prawdziwych tokenów, spróbuj pobrać dane przez nasze API
      try {
        console.log("AuthAPI: Fetching user data from our API /auth/me");
        const response = await fetch("/api/auth/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.user) {
            console.log(
              "AuthAPI: Successfully fetched user data from API:",
              result.user
            );

            // Zaktualizuj localStorage z najnowszymi danymi
            localStorage.setItem("user", JSON.stringify(result.user));
            return result.user;
          }
        } else {
          console.warn(
            "AuthAPI: API /auth/me failed with status:",
            response.status
          );
        }
      } catch (apiError: any) {
        console.warn("AuthAPI: API /auth/me failed:", apiError);
      }

      // Fallback - sprawdź czy mamy podstawowe dane w localStorage
      const storedUser = this.getStoredUser();
      if (storedUser) {
        console.log("AuthAPI: Fallback to stored user data");
        return storedUser;
      }

      return null;
    } catch (error) {
      console.warn("getCurrentUser failed:", error);
      return null;
    }
  }

  static isAuthenticated(): boolean {
    return !!localStorage.getItem("auth_token");
  }

  static getStoredUser(): User | null {
    try {
      const userJson = localStorage.getItem("user");
      return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
      return null;
    }
  }
}
