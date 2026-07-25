import { DataFactory } from 'n3';
import { createVocabulary, extendVocabulary, IPMS, UI } from '../../../src/util/Vocabularies';

describe('Vocabularies', (): void => {
  const vocabulary = createVocabulary('http://www.w3.org/ns/ldp#', 'contains', 'Container');

  describe('createVocabulary', (): void => {
    it('contains its own URI.', (): void => {
      expect(vocabulary.namespace).toBe('http://www.w3.org/ns/ldp#');
    });

    it('contains its own URI as a term.', (): void => {
      expect(vocabulary.terms.namespace).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#'));
    });

    it('exposes the defined URIs.', (): void => {
      expect(vocabulary.contains).toBe('http://www.w3.org/ns/ldp#contains');
      expect(vocabulary.Container).toBe('http://www.w3.org/ns/ldp#Container');
    });

    it('exposes the defined URIs as terms.', (): void => {
      expect(vocabulary.terms.contains).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#contains'));
      expect(vocabulary.terms.Container).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#Container'));
    });
  });

  describe('extendVocabulary', (): void => {
    const extended = extendVocabulary(vocabulary, 'extended', 'extra');

    it('still contains all the original values.', async(): Promise<void> => {
      expect(extended.namespace).toBe('http://www.w3.org/ns/ldp#');
      expect(extended.terms.namespace).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#'));
      expect(extended.contains).toBe('http://www.w3.org/ns/ldp#contains');
      expect(extended.Container).toBe('http://www.w3.org/ns/ldp#Container');
      expect(extended.terms.contains).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#contains'));
      expect(extended.terms.Container).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#Container'));
    });

    it('contains the new values.', async(): Promise<void> => {
      expect(extended.extended).toBe('http://www.w3.org/ns/ldp#extended');
      expect(extended.extra).toBe('http://www.w3.org/ns/ldp#extra');
      expect(extended.terms.extended).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#extended'));
      expect(extended.terms.extra).toEqual(DataFactory.namedNode('http://www.w3.org/ns/ldp#extra'));
    });

    it('does not modify the original vocabulary.', async(): Promise<void> => {
      expect((vocabulary as any).extended).toBeUndefined();
    });
  });

  describe('IPMS vocabulary', (): void => {
    it('uses the correct namespace.', (): void => {
      expect(IPMS.namespace).toBe('urn:solid-server:databox:ipms#');
    });

    it('resolves core module framework terms.', (): void => {
      expect(IPMS.Module).toBe('urn:solid-server:databox:ipms#Module');
      expect(IPMS.enabled).toBe('urn:solid-server:databox:ipms#enabled');
      expect(IPMS.config).toBe('urn:solid-server:databox:ipms#config');
      expect(IPMS.configShape).toBe('urn:solid-server:databox:ipms#configShape');
      expect(IPMS.manifest).toBe('urn:solid-server:databox:ipms#manifest');
    });

    it('resolves install profile terms.', (): void => {
      expect(IPMS.InstallProfile).toBe('urn:solid-server:databox:ipms#InstallProfile');
      expect(IPMS.ServerInstall).toBe('urn:solid-server:databox:ipms#ServerInstall');
      expect(IPMS.PosInstall).toBe('urn:solid-server:databox:ipms#PosInstall');
      expect(IPMS.ConnectorInstall).toBe('urn:solid-server:databox:ipms#ConnectorInstall');
    });

    it('resolves native POS device terms.', (): void => {
      expect(IPMS.NativePosDeviceDescriptor).toBe('urn:solid-server:databox:ipms#NativePosDeviceDescriptor');
      expect(IPMS.NativePosDeviceJob).toBe('urn:solid-server:databox:ipms#NativePosDeviceJob');
      expect(IPMS.deviceKind).toBe('urn:solid-server:databox:ipms#deviceKind');
      expect(IPMS.mtlsDeviceWebId).toBe('urn:solid-server:databox:ipms#mtlsDeviceWebId');
    });
  });

  describe('UI vocabulary', (): void => {
    it('uses the correct namespace.', (): void => {
      expect(UI.namespace).toBe('http://www.w3.org/ns/ui#');
    });

    it('resolves form type terms.', (): void => {
      expect(UI.Form).toBe('http://www.w3.org/ns/ui#Form');
      expect(UI.Group).toBe('http://www.w3.org/ns/ui#Group');
      expect(UI.Single).toBe('http://www.w3.org/ns/ui#Single');
      expect(UI.Multiple).toBe('http://www.w3.org/ns/ui#Multiple');
      expect(UI.Choice).toBe('http://www.w3.org/ns/ui#Choice');
    });

    it('resolves field type terms.', (): void => {
      expect(UI.Text).toBe('http://www.w3.org/ns/ui#Text');
      expect(UI.TextInput).toBe('http://www.w3.org/ns/ui#TextInput');
      expect(UI.TextArea).toBe('http://www.w3.org/ns/ui#TextArea');
      expect(UI.Number).toBe('http://www.w3.org/ns/ui#Number');
      expect(UI.Integer).toBe('http://www.w3.org/ns/ui#Integer');
      expect(UI.Decimal).toBe('http://www.w3.org/ns/ui#Decimal');
      expect(UI.Date).toBe('http://www.w3.org/ns/ui#Date');
      expect(UI.DateTime).toBe('http://www.w3.org/ns/ui#DateTime');
      expect(UI.Boolean).toBe('http://www.w3.org/ns/ui#Boolean');
    });

    it('resolves form property terms.', (): void => {
      expect(UI.parts).toBe('http://www.w3.org/ns/ui#parts');
      expect(UI.property).toBe('http://www.w3.org/ns/ui#property');
      expect(UI.label).toBe('http://www.w3.org/ns/ui#label');
      expect(UI.required).toBe('http://www.w3.org/ns/ui#required');
      expect(UI.readOnly).toBe('http://www.w3.org/ns/ui#readOnly');
      expect(UI.placeholder).toBe('http://www.w3.org/ns/ui#placeholder');
    });
  });
});
