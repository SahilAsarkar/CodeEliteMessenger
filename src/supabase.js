import { createClient } from '@supabase/supabase-js'

const supabaseUrl = "https://juoonqfkknbrcxnkylqp.supabase.co"
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1b29ucWZra25icmN4bmt5bHFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MTMwMTksImV4cCI6MjA4ODM4OTAxOX0.kBPYnb2cv6TexZJWffUs41rQM_55csFkqNAK95KJ-IA"

export const supabase = createClient(supabaseUrl, supabaseKey)