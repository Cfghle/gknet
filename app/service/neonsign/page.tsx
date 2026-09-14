import type { Metadata } from "next";
import NeonEditor from "@/app/components/Neonsign/NeonEditor";
import { previewSegments, sharedConfigFromCode, siteUrl, SITE_TITLE } from "@/app/components/Neonsign/share";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

// 카카오톡·SNS가 링크를 긁어갈 때 보는 미리보기 정보. 공유 링크(?c=)면 그 문구를 제목 아래 설명과 이미지에 넣는다
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { c } = await searchParams;
  const code = typeof c === "string" ? c : undefined;
  const cfg = await sharedConfigFromCode(code);
  const text = cfg ? previewSegments(cfg).text : "";
  const description = text
    ? `“${text.length > 80 ? text.slice(0, 80) + "…" : text}” — 눌러서 움직이는 전광판 보기`
    : "문구를 넣으면 LED 전광판으로 흘러가요. GIF·영상으로 저장하고 친구에게 공유해 보세요.";
  const image = `/service/neonsign/og${cfg && code ? `?c=${code}` : ""}`;

  return {
    metadataBase: siteUrl(),
    title: SITE_TITLE,
    description,
    openGraph: {
      type: "website",
      title: SITE_TITLE,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: SITE_TITLE }],
    },
    twitter: { card: "summary_large_image", title: SITE_TITLE, description, images: [image] },
  };
}

export default function NeonsignPage() {
  return (
    <>
      <h2>전광판</h2>
      <p>문구를 도트 매트릭스(LED 전광판)로 그려주는 편집기입니다. 아래에서 바로 만들고 재생해볼 수 있어요.</p>
      <NeonEditor />
    </>
  );
}
