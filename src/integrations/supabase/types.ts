export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      bathroom_state: {
        Row: {
          changed_at: string;
          cleaning: boolean;
          cleaning_since: string | null;
          id: string;
          lat: number | null;
          location_required: boolean;
          lng: number | null;
          radius_m: number;
        };
        Insert: {
          changed_at?: string;
          cleaning?: boolean;
          cleaning_since?: string | null;
          id: string;
          lat?: number | null;
          location_required?: boolean;
          lng?: number | null;
          radius_m?: number;
        };
        Update: {
          changed_at?: string;
          cleaning?: boolean;
          cleaning_since?: string | null;
          id?: string;
          lat?: number | null;
          location_required?: boolean;
          lng?: number | null;
          radius_m?: number;
        };
        Relationships: [];
      };
      queue_tickets: {
        Row: {
          created_at: string;
          id: string;
          ticket: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ticket: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ticket?: string;
        };
        Relationships: [];
      };
      stall_report_comments: {
        Row: {
          commenter_ticket: string;
          created_at: string;
          id: string;
          image_data_url: string | null;
          message: string;
          report_id: string;
        };
        Insert: {
          commenter_ticket: string;
          created_at?: string;
          id?: string;
          image_data_url?: string | null;
          message: string;
          report_id: string;
        };
        Update: {
          commenter_ticket?: string;
          created_at?: string;
          id?: string;
          image_data_url?: string | null;
          message?: string;
          report_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stall_report_comments_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "stall_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      stall_report_comment_reactions: {
        Row: {
          comment_id: string;
          created_at: string;
          emoji: string;
          id: string;
          reactor_owner_hash: string;
          reactor_ticket: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          emoji: string;
          id?: string;
          reactor_owner_hash: string;
          reactor_ticket: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          emoji?: string;
          id?: string;
          reactor_owner_hash?: string;
          reactor_ticket?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stall_report_comment_reactions_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "stall_report_comments";
            referencedColumns: ["id"];
          },
        ];
      };
      stall_report_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          id: string;
          reactor_owner_hash: string | null;
          reactor_ticket: string;
          report_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          id?: string;
          reactor_owner_hash?: string | null;
          reactor_ticket: string;
          report_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          id?: string;
          reactor_owner_hash?: string | null;
          reactor_ticket?: string;
          report_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stall_report_reactions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "stall_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      stall_reports: {
        Row: {
          created_at: string;
          id: string;
          image_data_url: string | null;
          message: string;
          owner_secret: string | null;
          reporter_ticket: string;
          stall_id: string;
          stall_label: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_data_url?: string | null;
          message: string;
          owner_secret?: string | null;
          reporter_ticket: string;
          stall_id: string;
          stall_label: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_data_url?: string | null;
          message?: string;
          owner_secret?: string | null;
          reporter_ticket?: string;
          stall_id?: string;
          stall_label?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stall_reports_stall_id_fkey";
            columns: ["stall_id"];
            isOneToOne: false;
            referencedRelation: "stalls";
            referencedColumns: ["id"];
          },
        ];
      };
      stalls: {
        Row: {
          changed_at: string;
          id: string;
          label: string;
          occupied: boolean;
          paper_1: string;
          paper_2: string;
        };
        Insert: {
          changed_at?: string;
          id: string;
          label: string;
          occupied?: boolean;
          paper_1?: string;
          paper_2?: string;
        };
        Update: {
          changed_at?: string;
          id?: string;
          label?: string;
          occupied?: boolean;
          paper_1?: string;
          paper_2?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_stall_report: {
        Args: {
          report_id: string;
          actor_owner_secret: string;
          admin_token: string;
        };
        Returns: string;
      };
      toggle_stall_report_comment_reaction: {
        Args: {
          target_comment_id: string;
          actor_ticket: string;
          actor_owner_secret: string;
          reaction_emoji: string;
        };
        Returns: boolean;
      };
      toggle_stall_report_reaction: {
        Args: {
          target_report_id: string;
          actor_ticket: string;
          actor_owner_secret: string;
          reaction_emoji: string;
        };
        Returns: boolean;
      };
      update_stall_report: {
        Args: {
          report_id: string;
          actor_owner_secret: string;
          admin_token: string;
          next_message: string;
          next_image_data_url: string | null;
        };
        Returns: Database["public"]["Tables"]["stall_reports"]["Row"];
      };
      verify_admin: {
        Args: {
          admin_password: string;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
