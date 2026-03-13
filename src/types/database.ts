export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          timezone: string | null
          musician_policy: string | null
          email_logo_url: string | null
          email_brand_color: string | null
          email_footer_text: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          timezone?: string | null
          musician_policy?: string | null
          email_logo_url?: string | null
          email_brand_color?: string | null
          email_footer_text?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          timezone?: string | null
          musician_policy?: string | null
          email_logo_url?: string | null
          email_brand_color?: string | null
          email_footer_text?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: 'owner' | 'admin' | 'member'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: 'owner' | 'admin' | 'member'
          created_at?: string
          updated_at?: string
        }
      }
      instruments: {
        Row: {
          id: string
          organization_id: string
          name: string
          abbreviation: string | null
          section: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          abbreviation?: string | null
          section?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          abbreviation?: string | null
          section?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
      }
      musicians: {
        Row: {
          id: string
          organization_id: string
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          notes: string | null
          is_active: boolean
          zip_code: string | null
          service_radius_miles: number | null
          call_order: number
          is_leader: boolean
          tags: string[] | null
          home_region: string | null
          w9_on_file: boolean
          w9_file_url: string | null
          w9_verified_at: string | null
          w9_verified_by: string | null
          zelle_method: 'email' | 'phone' | null
          zelle_verified: boolean
          user_id: string | null
          portal_invite_token: string | null
          portal_invite_sent_at: string | null
          portal_invite_expires_at: string | null
          portal_last_login: string | null
          portal_enabled: boolean
          profile_photo_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          notes?: string | null
          is_active?: boolean
          zip_code?: string | null
          service_radius_miles?: number | null
          call_order?: number
          is_leader?: boolean
          tags?: string[] | null
          home_region?: string | null
          w9_on_file?: boolean
          w9_verified_at?: string | null
          w9_verified_by?: string | null
          zelle_method?: 'email' | 'phone' | null
          zelle_verified?: boolean
          user_id?: string | null
          portal_invite_token?: string | null
          portal_invite_sent_at?: string | null
          portal_invite_expires_at?: string | null
          portal_last_login?: string | null
          portal_enabled?: boolean
          profile_photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          notes?: string | null
          is_active?: boolean
          zip_code?: string | null
          service_radius_miles?: number | null
          call_order?: number
          is_leader?: boolean
          tags?: string[] | null
          home_region?: string | null
          w9_on_file?: boolean
          w9_verified_at?: string | null
          w9_verified_by?: string | null
          zelle_method?: 'email' | 'phone' | null
          zelle_verified?: boolean
          user_id?: string | null
          portal_invite_token?: string | null
          portal_invite_sent_at?: string | null
          portal_invite_expires_at?: string | null
          portal_last_login?: string | null
          portal_enabled?: boolean
          profile_photo_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      musician_instruments: {
        Row: {
          id: string
          musician_id: string
          instrument_id: string
          is_primary: boolean
          proficiency: string
          created_at: string
        }
        Insert: {
          id?: string
          musician_id: string
          instrument_id: string
          is_primary?: boolean
          proficiency?: string
          created_at?: string
        }
        Update: {
          id?: string
          musician_id?: string
          instrument_id?: string
          is_primary?: boolean
          proficiency?: string
          created_at?: string
        }
      }
      books: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      book_entries: {
        Row: {
          id: string
          book_id: string
          musician_id: string
          instrument_id: string
          chair_number: number | null
          priority: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          book_id: string
          musician_id: string
          instrument_id: string
          chair_number?: number | null
          priority?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          book_id?: string
          musician_id?: string
          instrument_id?: string
          chair_number?: number | null
          priority?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          internal_notes: string | null
          start_date: string | null
          end_date: string | null
          status: 'draft' | 'active' | 'completed' | 'cancelled'
          book_id: string | null
          ensemble_type: string | null
          client_name: string | null
          client_email: string | null
          client_phone: string | null
          event_type: string | null
          contract_amount: number | null
          deposit_amount: number | null
          deposit_paid_at: string | null
          payment_status: 'pending' | 'deposit_paid' | 'fully_paid'
          payment_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          internal_notes?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: 'draft' | 'active' | 'completed' | 'cancelled'
          book_id?: string | null
          ensemble_type?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          event_type?: string | null
          contract_amount?: number | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          payment_status?: 'pending' | 'deposit_paid' | 'fully_paid'
          payment_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          internal_notes?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: 'draft' | 'active' | 'completed' | 'cancelled'
          book_id?: string | null
          ensemble_type?: string | null
          client_name?: string | null
          client_email?: string | null
          client_phone?: string | null
          event_type?: string | null
          contract_amount?: number | null
          deposit_amount?: number | null
          deposit_paid_at?: string | null
          payment_status?: 'pending' | 'deposit_paid' | 'fully_paid'
          payment_notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      venues: {
        Row: {
          id: string
          organization_id: string
          name: string
          address: string | null
          city: string | null
          state: string | null
          zip: string | null
          google_place_id: string | null
          google_maps_url: string | null
          parking_info: string | null
          directions: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          google_place_id?: string | null
          google_maps_url?: string | null
          parking_info?: string | null
          directions?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
          google_place_id?: string | null
          google_maps_url?: string | null
          parking_info?: string | null
          directions?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      services: {
        Row: {
          id: string
          project_id: string
          name: string
          service_type: string
          venue: string | null
          venue_id: string | null
          call_time: string | null
          start_time: string
          end_time: string | null
          notes: string | null
          base_pay: number | null
          leader_fee: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          service_type: string
          venue?: string | null
          venue_id?: string | null
          call_time?: string | null
          start_time: string
          end_time?: string | null
          notes?: string | null
          base_pay?: number | null
          leader_fee?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          service_type?: string
          venue?: string | null
          venue_id?: string | null
          call_time?: string | null
          start_time?: string
          end_time?: string | null
          notes?: string | null
          base_pay?: number | null
          leader_fee?: number | null
          created_at?: string
          updated_at?: string
        }
      }
      project_positions: {
        Row: {
          id: string
          project_id: string
          instrument_id: string
          chair_number: number
          musician_id: string | null
          status: 'vacant' | 'offered' | 'confirmed' | 'declined'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          instrument_id: string
          chair_number: number
          musician_id?: string | null
          status?: 'vacant' | 'offered' | 'confirmed' | 'declined'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          instrument_id?: string
          chair_number?: number
          musician_id?: string | null
          status?: 'vacant' | 'offered' | 'confirmed' | 'declined'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      contract_offers: {
        Row: {
          id: string
          project_position_id: string
          musician_id: string
          token: string
          status: 'pending' | 'viewed' | 'accepted' | 'declined' | 'expired'
          custom_pay: number | null
          sent_at: string | null
          viewed_at: string | null
          responded_at: string | null
          response_notes: string | null
          expires_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_position_id: string
          musician_id: string
          token?: string
          status?: 'pending' | 'viewed' | 'accepted' | 'declined' | 'expired'
          custom_pay?: number | null
          sent_at?: string | null
          viewed_at?: string | null
          responded_at?: string | null
          response_notes?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_position_id?: string
          musician_id?: string
          token?: string
          status?: 'pending' | 'viewed' | 'accepted' | 'declined' | 'expired'
          custom_pay?: number | null
          sent_at?: string | null
          viewed_at?: string | null
          responded_at?: string | null
          response_notes?: string | null
          expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      substitution_requests: {
        Row: {
          id: string
          project_position_id: string
          requesting_musician_id: string
          service_id: string | null
          reason: string | null
          status: 'pending_approval' | 'approved' | 'declined' | 'sub_declined' | 'filled' | 'cancelled'
          substitute_musician_id: string | null
          suggested_sub_name: string | null
          suggested_sub_email: string | null
          suggested_sub_phone: string | null
          suggested_sub_instrument_id: string | null
          admin_notes: string | null
          offer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_position_id: string
          requesting_musician_id: string
          service_id?: string | null
          reason?: string | null
          status?: 'pending_approval' | 'approved' | 'declined' | 'sub_declined' | 'filled' | 'cancelled'
          substitute_musician_id?: string | null
          suggested_sub_name?: string | null
          suggested_sub_email?: string | null
          suggested_sub_phone?: string | null
          suggested_sub_instrument_id?: string | null
          admin_notes?: string | null
          offer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_position_id?: string
          requesting_musician_id?: string
          service_id?: string | null
          reason?: string | null
          status?: 'pending_approval' | 'approved' | 'declined' | 'sub_declined' | 'filled' | 'cancelled'
          substitute_musician_id?: string | null
          suggested_sub_name?: string | null
          suggested_sub_email?: string | null
          suggested_sub_phone?: string | null
          suggested_sub_instrument_id?: string | null
          admin_notes?: string | null
          offer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      competing_schedules: {
        Row: {
          id: string
          musician_id: string
          title: string
          start_time: string
          end_time: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          musician_id: string
          title: string
          start_time: string
          end_time: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          musician_id?: string
          title?: string
          start_time?: string
          end_time?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          organization_id: string
          service_id: string
          musician_id: string
          project_position_id: string | null
          amount: number
          is_leader_fee: boolean
          payment_type: 'standard' | 'adjustment' | 'correction' | 'bonus'
          status: 'unpaid' | 'pending' | 'paid'
          payment_date: string | null
          payment_method: string | null
          payment_reference: string | null
          notes: string | null
          exported_at: string | null
          export_batch_id: string | null
          paid_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          service_id: string
          musician_id: string
          project_position_id?: string | null
          amount: number
          is_leader_fee?: boolean
          payment_type?: 'standard' | 'adjustment' | 'correction' | 'bonus'
          status?: 'unpaid' | 'pending' | 'paid'
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          exported_at?: string | null
          export_batch_id?: string | null
          paid_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          service_id?: string
          musician_id?: string
          project_position_id?: string | null
          amount?: number
          is_leader_fee?: boolean
          payment_type?: 'standard' | 'adjustment' | 'correction' | 'bonus'
          status?: 'unpaid' | 'pending' | 'paid'
          payment_date?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          notes?: string | null
          exported_at?: string | null
          export_batch_id?: string | null
          paid_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      staffing_presets: {
        Row: {
          id: string
          organization_id: string
          name: string
          description: string | null
          category: string
          positions: { instrument_name: string; chair_number: number }[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          category?: string
          positions: { instrument_name: string; chair_number: number }[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          category?: string
          positions?: { instrument_name: string; chair_number: number }[]
          created_at?: string
          updated_at?: string
        }
      }
      musician_notification_preferences: {
        Row: {
          musician_id: string
          email_new_offers: boolean
          email_offer_reminders: boolean
          email_schedule_changes: boolean
          email_payment_updates: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          musician_id: string
          email_new_offers?: boolean
          email_offer_reminders?: boolean
          email_schedule_changes?: boolean
          email_payment_updates?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          musician_id?: string
          email_new_offers?: boolean
          email_offer_reminders?: boolean
          email_schedule_changes?: boolean
          email_payment_updates?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      user_tutorial_state: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          wizard_completed: boolean
          wizard_step: number
          dismissed_tooltips: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          organization_id: string
          wizard_completed?: boolean
          wizard_step?: number
          dismissed_tooltips?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          organization_id?: string
          wizard_completed?: boolean
          wizard_step?: number
          dismissed_tooltips?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      impersonation_log: {
        Row: {
          id: string
          admin_user_id: string
          musician_id: string
          organization_id: string
          created_at: string
        }
        Insert: {
          id?: string
          admin_user_id: string
          musician_id: string
          organization_id: string
          created_at?: string
        }
        Update: {
          id?: string
          admin_user_id?: string
          musician_id?: string
          organization_id?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_org_member: {
        Args: { org_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { org_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Convenience types
export type Organization = Database['public']['Tables']['organizations']['Row']
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row']
export type Instrument = Database['public']['Tables']['instruments']['Row']
export type Musician = Database['public']['Tables']['musicians']['Row']
export type MusicianInstrument = Database['public']['Tables']['musician_instruments']['Row']
export type Book = Database['public']['Tables']['books']['Row']
export type BookEntry = Database['public']['Tables']['book_entries']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Venue = Database['public']['Tables']['venues']['Row']
export type Service = Database['public']['Tables']['services']['Row']
export type ProjectPosition = Database['public']['Tables']['project_positions']['Row']
export type ContractOffer = Database['public']['Tables']['contract_offers']['Row']
export type SubstitutionRequest = Database['public']['Tables']['substitution_requests']['Row']
export type CompetingSchedule = Database['public']['Tables']['competing_schedules']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type StaffingPreset = Database['public']['Tables']['staffing_presets']['Row']
export type MusicianNotificationPreferences = Database['public']['Tables']['musician_notification_preferences']['Row']
export type UserTutorialState = Database['public']['Tables']['user_tutorial_state']['Row']

// Email audit log (manual type — table added in migration 038)
export interface EmailLog {
  id: string
  organization_id: string
  recipient_email: string
  recipient_name: string | null
  subject: string
  email_type: string
  musician_id: string | null
  project_id: string | null
  offer_id: string | null
  resend_email_id: string | null
  status: string
  metadata: Record<string, unknown>
  sent_at: string
}
export interface GigDetailSend {
  id: string
  project_id: string
  organization_id: string
  sent_at: string
  sent_by: string
  musician_count: number
}

export interface GigDetailConfirmation {
  id: string
  send_id: string
  musician_id: string
  token: string
  email_sent_at: string
  confirmed_at: string | null
}

export type ImpersonationLog = Database['public']['Tables']['impersonation_log']['Row']

// Project Files (manual types — tables added in migration 041)
export interface ProjectFile {
  id: string
  project_id: string
  organization_id: string
  file_name: string
  storage_path: string
  file_size: number
  mime_type: string
  scope: string
  uploaded_by: string
  uploaded_at: string
  notes: string | null
}

export interface ProjectFileInstrument {
  id: string
  file_id: string
  instrument_id: string
}

export interface MusicSend {
  id: string
  project_id: string
  organization_id: string
  sent_at: string
  sent_by: string
  musician_count: number
  notes: string | null
}

export interface MusicConfirmation {
  id: string
  send_id: string
  musician_id: string
  token: string
  email_sent_at: string
  confirmed_at: string | null
}

export interface ProjectFileDownload {
  id: string
  file_id: string
  musician_id: string
  downloaded_at: string
}
