-- Tutorial state tracking for user onboarding
CREATE TABLE user_tutorial_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wizard_completed BOOLEAN DEFAULT FALSE,
  wizard_step INTEGER DEFAULT 0,
  dismissed_tooltips TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

-- RLS policies
ALTER TABLE user_tutorial_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tutorial state"
  ON user_tutorial_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tutorial state"
  ON user_tutorial_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tutorial state"
  ON user_tutorial_state FOR UPDATE
  USING (auth.uid() = user_id);
