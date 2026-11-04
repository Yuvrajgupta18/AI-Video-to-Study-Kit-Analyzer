import { Compass } from 'lucide-react'
import { ButtonLink, Card, EmptyState } from '../components/ui'

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        headingLevel="h1"
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={<ButtonLink to="/">Back to dashboard</ButtonLink>}
      />
    </Card>
  )
}
