/**
 * ComingSoon — placeholder สำหรับ route ที่ยังไม่ได้ implement.
 * Wave 4.3 และ 4.4 จะ replace ด้วย real components.
 */

interface ComingSoonProps {
  name: string;
}

export default function ComingSoon({ name }: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6">
      <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <span className="text-primary text-xl">🚧</span>
      </div>
      <div className="text-center">
        <h2 className="font-display text-xl font-bold text-foreground mb-1">
          {name}
        </h2>
        <p className="font-content text-sm text-muted-foreground">
          กำลังสร้าง — Sprint 2/3/4
        </p>
      </div>
    </div>
  );
}
