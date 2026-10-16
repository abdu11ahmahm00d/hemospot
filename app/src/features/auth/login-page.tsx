/**
 * login-page.tsx — email + password sign-in.
 *
 * Serves FR1.1's "authorized user" gate for every later screen: authentication is
 * Supabase's (`signInWithPassword`), we own nothing but the form and its states.
 */

import { useState } from "react"
import { LogIn } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

export function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function signIn(submittedEmail: string, submittedPassword: string) {
    if (!supabase) return
    setIsSubmitting(true)
    setErrorMessage(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: submittedEmail,
      password: submittedPassword,
    })

    if (error) setErrorMessage(error.message)
    setIsSubmitting(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Hemospot</CardTitle>
          <CardDescription>
            Forensic case management with bloodstain pattern analysis. Sign in with your
            investigator account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void signIn(email, password)
            }}
          >
            <Input
              type="email"
              placeholder="investigator@forensics.gov"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-label="Email"
              required
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-label="Password"
              required
            />
            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              <LogIn className="mr-2 size-4" />
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
