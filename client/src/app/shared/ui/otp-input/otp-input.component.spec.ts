import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OtpInputComponent } from './otp-input.component';

/**
 * Bileşenin can alıcı noktası kutuların gerçekten çizilmesi: `digits` dizisi
 * boş kalırsa ekranda tek bir input bile görünmüyor ve kullanıcı kodu hiçbir
 * yere giremiyor. İlk test tam olarak bunu koruyor.
 */
describe('OtpInputComponent', () => {
  async function setup(length?: number): Promise<ComponentFixture<OtpInputComponent>> {
    await TestBed.configureTestingModule({
      imports: [OtpInputComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(OtpInputComponent);
    if (length !== undefined) fixture.componentRef.setInput('length', length);

    fixture.detectChanges();
    return fixture;
  }

  function boxes(fixture: ComponentFixture<OtpInputComponent>): HTMLInputElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input.otp__box'));
  }

  function type(fixture: ComponentFixture<OtpInputComponent>, index: number, char: string): void {
    const input = boxes(fixture)[index]!;
    input.value = char;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function press(fixture: ComponentFixture<OtpInputComponent>, index: number, key: string): void {
    boxes(fixture)[index]!.dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
  }

  it('açılışta length kadar boş kutu çizer', async () => {
    const fixture = await setup();

    expect(boxes(fixture).length).toBe(6);
    expect(boxes(fixture).every((box) => box.value === '')).toBe(true);
  });

  it('length değiştirildiğinde o kadar kutu çizer', async () => {
    const fixture = await setup(4);

    expect(boxes(fixture).length).toBe(4);
  });

  it('yazılan rakamı değere yansıtır', async () => {
    const fixture = await setup();

    type(fixture, 0, '7');

    expect(fixture.componentInstance.value()).toBe('7');
  });

  it('rakam olmayan girişi yok sayar', async () => {
    const fixture = await setup();

    type(fixture, 0, 'a');

    expect(fixture.componentInstance.value()).toBe('');
    expect(boxes(fixture)[0]!.value).toBe('');
  });

  it('yapıştırılan kodu hanelere dağıtır ve completed yayınlar', async () => {
    const fixture = await setup();
    const emitted: string[] = [];
    fixture.componentInstance.completed.subscribe((code) => emitted.push(code));

    const event = new Event('paste') as Event & {
      clipboardData: { getData: () => string };
    };
    event.clipboardData = { getData: () => '123456' };

    boxes(fixture)[0]!.dispatchEvent(event);
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('123456');
    expect(boxes(fixture).map((box) => box.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(emitted).toEqual(['123456']);
  });

  it('yapıştırmada rakam olmayanları ayıklar ve fazlasını keser', async () => {
    const fixture = await setup();

    const event = new Event('paste') as Event & {
      clipboardData: { getData: () => string };
    };
    event.clipboardData = { getData: () => 'kod: 12-34-56-78' };

    boxes(fixture)[0]!.dispatchEvent(event);
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('123456');
  });

  it('boş kutuda Backspace önceki haneyi siler', async () => {
    const fixture = await setup();

    type(fixture, 0, '1');
    type(fixture, 1, '2');
    // 3. kutu boş; oradaki Backspace 2. hanenin değerini silmeli.
    press(fixture, 2, 'Backspace');

    expect(fixture.componentInstance.value()).toBe('1');
  });

  it('dolu kutuda Backspace yalnızca o haneyi siler', async () => {
    const fixture = await setup();

    type(fixture, 0, '1');
    type(fixture, 1, '2');
    press(fixture, 1, 'Backspace');

    // 1. hane yerinde kalmalı; ortadaki boşluk sağdakileri sola kaydırmamalı.
    expect(fixture.componentInstance.value()).toBe('1');
    expect(boxes(fixture)[0]!.value).toBe('1');
  });

  it('reset kutuları temizler', async () => {
    const fixture = await setup();

    type(fixture, 0, '1');
    fixture.componentInstance.reset();
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('');
    expect(boxes(fixture).every((box) => box.value === '')).toBe(true);
  });

  it('dışarıdan verilen değeri kutulara dağıtır', async () => {
    const fixture = await setup();

    fixture.componentInstance.value.set('42');
    fixture.detectChanges();

    expect(boxes(fixture).map((box) => box.value)).toEqual(['4', '2', '', '', '', '']);
  });
});
