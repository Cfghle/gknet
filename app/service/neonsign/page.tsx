import NeonEditor from "@/app/components/Neonsign/NeonEditor";

export default function NeonsignPage() {
  return (
    <>
      <h2>전광판</h2>
      <p>문구를 도트 매트릭스(LED 전광판)로 그려주는 편집기입니다. 아래에서 바로 만들고 재생해볼 수 있어요.</p>
      <NeonEditor />
    </>
  );
}
