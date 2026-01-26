'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isOAuthUser, setIsOAuthUser] = useState(false)

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  })

  async function onSubmit(data: ForgotPasswordInput) {
    setIsLoading(true)
    setError(null)
    setIsOAuthUser(false)

    const supabase = createClient()

    // First, check if this email exists and how they signed up
    // We'll try to send the reset email and check the response
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      data.email,
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      }
    )

    if (resetError) {
      // Check if this is a rate limit error
      if (resetError.message.includes('rate') || resetError.message.includes('limit')) {
        setError('Too many reset requests. Please try again later.')
      } else {
        setError(resetError.message)
      }
      setIsLoading(false)
      return
    }

    // Note: Supabase doesn't tell us if the email exists for security reasons
    // It will always return success even if email doesn't exist
    // We show a generic success message
    setSuccess(true)
    setIsLoading(false)
  }

  if (success) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            We&apos;ve sent a password reset link to your email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4 text-sm text-green-800 dark:text-green-200">
            <p className="font-medium">Next steps:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Check your inbox for the reset link</li>
              <li>Click the link to set a new password</li>
              <li>The link expires in 1 hour</li>
            </ol>
          </div>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive an email? Check your spam folder or{' '}
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setSuccess(false)
                form.reset()
              }}
            >
              try again
            </button>
          </p>
          <div className="pt-2">
            <Link href="/login">
              <Button variant="outline" className="w-full">
                Back to Sign in
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isOAuthUser) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Google Sign-In Account</CardTitle>
          <CardDescription>
            This email is associated with a Google Sign-In account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4 text-sm text-blue-800 dark:text-blue-200">
            <p>
              You signed up using Google. Please use the &quot;Sign in with Google&quot; button
              on the login page to access your account.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Having trouble with your Google account?{' '}
            <a
              href="https://accounts.google.com/signin/recovery"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Visit Google Account Recovery
            </a>
          </p>
          <div className="pt-2">
            <Link href="/login">
              <Button className="w-full">
                Back to Sign in
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Forgot password?</CardTitle>
        <CardDescription>
          Enter your email address and we&apos;ll send you a link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        </Form>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Remember your password?{' '}
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
        <div className="mt-2 text-center text-sm text-muted-foreground">
          Need help?{' '}
          <a
            href="mailto:support@podiumpersonnel.com"
            className="text-primary underline-offset-4 hover:underline"
          >
            Contact support
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
