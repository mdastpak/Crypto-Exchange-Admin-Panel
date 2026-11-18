import { createFileRoute } from '@tanstack/react-router'
import { SessionsPage } from '@/features/sessions/sessions-page'

export const Route = createFileRoute('/_authenticated/sessions')({ component: SessionsPage })
