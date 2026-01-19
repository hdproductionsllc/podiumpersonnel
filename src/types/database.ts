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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
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
          start_date: string | null
          end_date: string | null
          status: 'draft' | 'active' | 'completed' | 'cancelled'
          book_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: 'draft' | 'active' | 'completed' | 'cancelled'
          book_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          description?: string | null
          start_date?: string | null
          end_date?: string | null
          status?: 'draft' | 'active' | 'completed' | 'cancelled'
          book_id?: string | null
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
          start_time: string
          end_time: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          service_type: string
          venue?: string | null
          start_time: string
          end_time?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          service_type?: string
          venue?: string | null
          start_time?: string
          end_time?: string | null
          notes?: string | null
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
          status: 'pending' | 'approved' | 'denied' | 'filled'
          substitute_musician_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_position_id: string
          requesting_musician_id: string
          service_id?: string | null
          reason?: string | null
          status?: 'pending' | 'approved' | 'denied' | 'filled'
          substitute_musician_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_position_id?: string
          requesting_musician_id?: string
          service_id?: string | null
          reason?: string | null
          status?: 'pending' | 'approved' | 'denied' | 'filled'
          substitute_musician_id?: string | null
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
export type Service = Database['public']['Tables']['services']['Row']
export type ProjectPosition = Database['public']['Tables']['project_positions']['Row']
export type ContractOffer = Database['public']['Tables']['contract_offers']['Row']
export type SubstitutionRequest = Database['public']['Tables']['substitution_requests']['Row']
export type CompetingSchedule = Database['public']['Tables']['competing_schedules']['Row']
