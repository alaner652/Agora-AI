import { NavLayout } from '@/components/NavLayout'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <NavLayout>{children}</NavLayout>
}
