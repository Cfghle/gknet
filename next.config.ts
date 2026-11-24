import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버를 localhost가 아닌 네트워크 주소(휴대폰·다른 PC)로 열면
  // Next.js가 /_next 개발 리소스를 기본으로 막아서 스크립트가 하나도 실행되지 않는다.
  // 집 안 사설 IP 대역을 허용해 둔다 (개발 모드에서만 쓰이는 설정)
  allowedDevOrigins: ["172.30.1.92", "172.30.1.*", "192.168.0.*", "192.168.1.*", "10.0.0.*"],
};

export default nextConfig;
