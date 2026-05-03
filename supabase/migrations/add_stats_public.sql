-- Migration: add stats_public column to profiles
-- Run this in Supabase SQL Editor
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stats_public BOOLEAN NOT NULL DEFAULT FALSE;
